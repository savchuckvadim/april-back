import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { User } from 'generated/prisma';
import {
    CabinetContext,
    CabinetPortalRef,
    cabinetActorLabel,
} from '../domain/cabinet-context';
import {
    CabinetMembershipRepository,
    MembershipWithUser,
} from '../persistence/cabinet-membership.repository';
import { PasswordHasher } from '../infrastructure/password-hasher';
import { CabinetVendorNotifier } from '../infrastructure/cabinet-vendor-notifier';
import { CabinetAccountProvisioner } from './cabinet-account-provisioner';
import { CabinetMemberView, toMemberView } from './cabinet-member.view';

export interface AddMemberInput {
    email: string;
    firstName: string;
    lastName: string;
    bitrixUserId?: string;
    /** owner — только администратор April (передаёт права сразу). */
    makeOwner?: boolean;
}

export interface AddMemberResult {
    member: CabinetMemberView;
    user: User;
    isNewUser: boolean;
}

/**
 * Участники кабинета портала: добавить, подтвердить заявку, передать права
 * владельца, снять доступ. Владелец у портала ОДИН (корневой пользователь
 * организации); «передача» — смена владельца одной транзакцией.
 *
 * Кто что может (уровень проверил гард): владелец — всё, кроме снятия
 * владельца; администратор April — всё. Учётка участника всегда
 * принадлежит организации портала — поэтому портал без клиента сначала
 * привязывается к организации в админке.
 */
@Injectable()
export class CabinetMembershipService {
    private readonly logger = new Logger(CabinetMembershipService.name);

    constructor(
        private readonly memberships: CabinetMembershipRepository,
        private readonly provisioner: CabinetAccountProvisioner,
        private readonly hasher: PasswordHasher,
        private readonly notifier: CabinetVendorNotifier,
    ) {}

    async list(ctx: CabinetContext): Promise<CabinetMemberView[]> {
        const portal = requirePortal(ctx);
        const rows = await this.memberships.listByPortal(portal.id);
        return rows.map(row => this.view(row));
    }

    async add(
        ctx: CabinetContext,
        input: AddMemberInput,
    ): Promise<AddMemberResult> {
        const portal = requirePortal(ctx);
        const clientId = requireClient(portal);
        if (input.makeOwner && ctx.level !== 'platform') {
            throw new ForbiddenException(
                'Назначить владельца при добавлении может только администратор April — используйте «Передать права»',
            );
        }
        const { user, isNew } = await this.provisioner.ensure({
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            clientId,
            bitrixUserId: input.bitrixUserId,
        });
        const membership = await this.memberships.upsert({
            portalId: portal.id,
            userId: user.id,
            role: 'member',
            bitrixUserId: input.bitrixUserId ?? null,
            invitedBy: cabinetActorLabel(ctx.subject),
        });
        if (
            input.makeOwner ||
            (await this.memberships.countOwners(portal.id)) === 0
        ) {
            // Первый участник портала становится владельцем сам: без
            // владельца кабинетом некому управлять.
            await this.memberships.transferOwnership(portal.id, membership.id);
        }
        this.logger.log(
            `Portal ${portal.domain ?? portal.id}: участник ${user.email ?? user.id} добавлен (${cabinetActorLabel(ctx.subject)})`,
        );
        return {
            member: await this.memberView(membership.id),
            user,
            isNewUser: isNew,
        };
    }

    /** Заявка из фрейма → участник (или владелец, если владельца нет). */
    async approve(
        ctx: CabinetContext,
        membershipId: string,
    ): Promise<CabinetMemberView> {
        const portal = requirePortal(ctx);
        const row = await this.requireMembership(portal, membershipId);
        if (row.role !== 'pending' || row.revokedAt) {
            throw new BadRequestException('Это не заявка на доступ');
        }
        await this.provisioner.adopt(row.user, requireClient(portal));
        const hasOwner = (await this.memberships.countOwners(portal.id)) > 0;
        if (hasOwner) {
            await this.memberships.setRole(row.id, 'member');
        } else {
            await this.memberships.transferOwnership(portal.id, row.id);
        }
        return this.memberView(row.id);
    }

    /** Передача прав владельца (корневого пользователя) другому участнику. */
    async makeOwner(
        ctx: CabinetContext,
        membershipId: string,
    ): Promise<CabinetMemberView> {
        const portal = requirePortal(ctx);
        const row = await this.requireMembership(portal, membershipId);
        if (row.revokedAt) {
            throw new BadRequestException(
                'Доступ этого участника снят — сначала верните доступ',
            );
        }
        if (row.role === 'pending' && ctx.level !== 'platform') {
            throw new BadRequestException(
                'Сначала подтвердите заявку, потом передавайте права',
            );
        }
        await this.memberships.transferOwnership(portal.id, row.id);
        await this.notifier.notify([
            '👑 Кабинет April: передача прав владельца',
            `Портал: ${portal.domain ?? portal.id}`,
            `Новый владелец: ${row.user.surname} ${row.user.name} <${row.user.email ?? '-'}>`,
            `Кто передал: ${cabinetActorLabel(ctx.subject)}`,
        ]);
        return this.memberView(row.id);
    }

    async revoke(ctx: CabinetContext, membershipId: string): Promise<void> {
        const portal = requirePortal(ctx);
        const row = await this.requireMembership(portal, membershipId);
        if (row.role === 'owner' && ctx.level !== 'platform') {
            throw new ForbiddenException(
                'Владельца нельзя отключить — сначала передайте права другому участнику',
            );
        }
        if (!row.revokedAt) {
            await this.memberships.revoke(row.id);
        }
    }

    private async requireMembership(
        portal: CabinetPortalRef,
        membershipId: string,
    ): Promise<MembershipWithUser> {
        const row = await this.memberships.findById(membershipId);
        if (!row || row.portalId !== portal.id) {
            throw new NotFoundException('Участник не найден на этом портале');
        }
        return row;
    }

    private async memberView(membershipId: string): Promise<CabinetMemberView> {
        const row = await this.memberships.findById(membershipId);
        if (!row) {
            throw new NotFoundException('Участник не найден');
        }
        return this.view(row);
    }

    private view(row: MembershipWithUser): CabinetMemberView {
        return toMemberView(row, user => this.hasher.isUsable(user.password));
    }
}

export function requirePortal(ctx: CabinetContext): CabinetPortalRef {
    if (!ctx.portal) {
        throw new BadRequestException('Не указан портал');
    }
    return ctx.portal;
}

function requireClient(portal: CabinetPortalRef): bigint {
    if (portal.clientId === null) {
        throw new BadRequestException(
            'Портал не привязан к организации-клиенту — привяжите его в админке April (карточка портала → «Кабинет»)',
        );
    }
    return portal.clientId;
}
