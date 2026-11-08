import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { CabinetContext } from '../domain/cabinet-context';
import { CabinetPortalRepository } from '../persistence/cabinet-portal.repository';
import { CabinetMembershipRepository } from '../persistence/cabinet-membership.repository';
import { CabinetTelegramBindingRepository } from '../persistence/cabinet-telegram-binding.repository';
import { PasswordHasher } from '../infrastructure/password-hasher';
import {
    CabinetMembershipService,
    requirePortal,
} from '../members/cabinet-membership.service';
import { CabinetMemberView } from '../members/cabinet-member.view';
import {
    CabinetPasswordService,
    IssuedPasswordLink,
} from '../session/cabinet-password.service';
import {
    TelegramBindingView,
    toBindingView,
} from '../telegram/cabinet-telegram-link.service';
import {
    CabinetAppStatus,
    CabinetAppStatusService,
} from './cabinet-app-status.service';

/** Карточка «Кабинет» портала в админке April. */
export interface CabinetAdminPortalCard {
    portalId: number;
    domain: string | null;
    clientId: number | null;
    organization: string | null;
    approvalStatus: string | null;
    /** Приложение April на портале: установка, режим, виджеты. */
    app: CabinetAppStatus;
    members: CabinetMemberView[];
    telegram: TelegramBindingView[];
}

/**
 * Операции администратора April над кабинетом клиента: всё, что может
 * владелец, плюс привязка портала к организации, ссылки на пароль для
 * любого участника (почты нет — админ передаёт ссылку сам) и отвязка
 * Telegram. Права проверяет контроллер (@Roles(SUPER_USER)).
 */
@Injectable()
export class CabinetAdminService {
    constructor(
        private readonly portals: CabinetPortalRepository,
        private readonly memberships: CabinetMembershipRepository,
        private readonly membershipService: CabinetMembershipService,
        private readonly bindings: CabinetTelegramBindingRepository,
        private readonly passwords: CabinetPasswordService,
        private readonly hasher: PasswordHasher,
        private readonly appStatus: CabinetAppStatusService,
    ) {}

    async portalCard(ctx: CabinetContext): Promise<CabinetAdminPortalCard> {
        const portal = requirePortal(ctx);
        const client =
            portal.clientId !== null
                ? await this.portals.findClient(portal.clientId)
                : null;
        const [members, telegram, app] = await Promise.all([
            this.membershipService.list(ctx),
            this.bindings.listActiveByPortal(portal.id),
            this.appStatus.status(portal),
        ]);
        return {
            portalId: Number(portal.id),
            domain: portal.domain,
            clientId: portal.clientId !== null ? Number(portal.clientId) : null,
            organization: client?.name ?? null,
            approvalStatus: portal.approvalStatus,
            app,
            members,
            telegram: telegram.map(toBindingView),
        };
    }

    /**
     * Привязать портал к организации (у клиента может быть несколько
     * порталов). Отвязать портал с действующими участниками нельзя —
     * их учётки принадлежат организации.
     */
    async attachClient(
        ctx: CabinetContext,
        clientId: number | null,
    ): Promise<CabinetAdminPortalCard> {
        const portal = requirePortal(ctx);
        if (clientId !== null) {
            const client = await this.portals.findClient(BigInt(clientId));
            if (!client) {
                throw new NotFoundException('Организация-клиент не найдена');
            }
        } else {
            const rows = await this.memberships.listByPortal(portal.id);
            if (rows.some(row => !row.revokedAt && row.role !== 'pending')) {
                throw new BadRequestException(
                    'У портала есть участники кабинета — сначала снимите им доступ',
                );
            }
        }
        const updated = await this.portals.attachClient(
            portal.id,
            clientId !== null ? BigInt(clientId) : null,
        );
        return this.portalCard({
            ...ctx,
            portal: { ...portal, clientId: updated.client_id },
        });
    }

    /** Ссылка установки (нет пароля) или сброса пароля участника портала. */
    async passwordLink(
        ctx: CabinetContext,
        membershipId: string,
    ): Promise<IssuedPasswordLink> {
        const portal = requirePortal(ctx);
        const row = await this.memberships.findById(membershipId);
        if (!row || row.portalId !== portal.id) {
            throw new NotFoundException('Участник не найден на этом портале');
        }
        return this.passwords.issueLink(
            row.user,
            this.hasher.isUsable(row.user.password) ? 'reset' : 'setup',
        );
    }

    async revokeTelegram(
        ctx: CabinetContext,
        bindingId: string,
    ): Promise<void> {
        const portal = requirePortal(ctx);
        const row = await this.bindings.findById(bindingId);
        if (!row || row.portalId !== portal.id) {
            throw new NotFoundException('Привязка не найдена');
        }
        if (!row.revokedAt) {
            await this.bindings.revoke(row.id);
        }
    }
}
