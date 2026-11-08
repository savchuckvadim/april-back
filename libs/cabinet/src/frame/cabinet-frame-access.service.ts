import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
} from '@nestjs/common';
import { CabinetRole } from '../domain/cabinet.constants';
import { CabinetContext } from '../domain/cabinet-context';
import { CabinetFrameSubject } from '../domain/cabinet-subject';
import { CabinetMembershipRepository } from '../persistence/cabinet-membership.repository';
import { CabinetUserRepository } from '../persistence/cabinet-user.repository';
import { CabinetAccountProvisioner } from '../members/cabinet-account-provisioner';
import { requirePortal } from '../members/cabinet-membership.service';
import { maskEmail } from '../members/cabinet-member.view';
import { CabinetThrottle } from '../infrastructure/cabinet-throttle';
import { CabinetVendorNotifier } from '../infrastructure/cabinet-vendor-notifier';
import { PasswordHasher } from '../infrastructure/password-hasher';

export interface FrameAccessRequestInput {
    email: string;
    firstName: string;
    lastName: string;
}

/** Состояние доступа сотрудника из фрейма к кабинету с сайта. */
export interface FrameAccessStatus {
    /** frame — доступа нет (или заявка ждёт подтверждения). */
    role: CabinetRole | null;
    membershipId: string | null;
    emailMasked: string | null;
    hasPassword: boolean;
}

/** Заявки: 3 в час на сотрудника портала. */
const REQUEST_LIMIT = 3;
const REQUEST_WINDOW_SECONDS = 3600;

/**
 * Доступ к кабинету с сайта для сотрудника, открывшего приложение во
 * фрейме Битрикса. Регистрации нет: сотрудник подаёт ЗАЯВКУ (email, имя),
 * она ждёт подтверждения владельца кабинета или администратора April и до
 * этого прав не даёт. Чужие действующие доступы заявка не трогает — иначе
 * любой сотрудник мог бы «присвоить» учётку владельца, введя его email.
 */
@Injectable()
export class CabinetFrameAccessService {
    private readonly logger = new Logger(CabinetFrameAccessService.name);

    constructor(
        private readonly memberships: CabinetMembershipRepository,
        private readonly users: CabinetUserRepository,
        private readonly provisioner: CabinetAccountProvisioner,
        private readonly throttle: CabinetThrottle,
        private readonly notifier: CabinetVendorNotifier,
        private readonly hasher: PasswordHasher,
    ) {}

    async status(ctx: CabinetContext): Promise<FrameAccessStatus> {
        requireFrame(ctx);
        const membership = ctx.membership;
        if (!membership) {
            return {
                role: null,
                membershipId: null,
                emailMasked: null,
                hasPassword: false,
            };
        }
        const user = await this.users.findById(membership.userId);
        return {
            role: membership.role,
            membershipId: membership.id,
            emailMasked: maskEmail(user?.email),
            hasPassword: this.hasher.isUsable(user?.password),
        };
    }

    async request(
        ctx: CabinetContext,
        input: FrameAccessRequestInput,
    ): Promise<FrameAccessStatus> {
        const subject = requireFrame(ctx);
        const portal = requirePortal(ctx);
        if (ctx.membership && ctx.membership.role !== 'pending') {
            throw new BadRequestException(
                'Доступ к кабинету у вас уже есть — войдите на сайте или восстановите пароль',
            );
        }
        await this.throttle.hit(
            `frame-request:${portal.id}:${subject.bitrixUserId}`,
            REQUEST_LIMIT,
            REQUEST_WINDOW_SECONDS,
            'Слишком много заявок — попробуйте через час',
        );
        const { user } = await this.provisioner.ensure({
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            clientId: portal.clientId,
            bitrixUserId: subject.bitrixUserId,
        });
        const existing = await this.memberships.findByPortalUser(
            portal.id,
            user.id,
        );
        if (existing && !existing.revokedAt && existing.role !== 'pending') {
            throw new ConflictException(
                'Этот email уже есть в кабинете портала — попросите владельца кабинета привязать ваш аккаунт Битрикс24',
            );
        }
        const membership = await this.memberships.upsert({
            portalId: portal.id,
            userId: user.id,
            role: 'pending',
            bitrixUserId: subject.bitrixUserId,
            invitedBy: `frame:${subject.bitrixUserId}`,
        });
        await this.notifier.notify([
            '🔑 Кабинет April: заявка на доступ',
            `Портал: ${portal.domain ?? portal.id}`,
            `Кто: ${input.lastName} ${input.firstName} <${user.email ?? input.email}>`,
            `Битрикс ID: ${subject.bitrixUserId}${subject.isAdmin ? ' (администратор портала)' : ''}`,
            'Подтвердить: владелец кабинета или админка → портал → «Кабинет».',
        ]);
        this.logger.log(
            `Portal ${portal.domain ?? portal.id}: заявка на доступ от frame:${subject.bitrixUserId}`,
        );
        return {
            role: 'pending',
            membershipId: membership.id,
            emailMasked: maskEmail(user.email),
            hasPassword: this.hasher.isUsable(user.password),
        };
    }
}

function requireFrame(ctx: CabinetContext): CabinetFrameSubject {
    if (ctx.subject.kind !== 'frame') {
        throw new BadRequestException(
            'Действие доступно только из приложения в Битрикс24',
        );
    }
    return ctx.subject;
}
