import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Portal } from 'generated/prisma';
import { CabinetContext } from '../domain/cabinet-context';
import { PasswordHasher } from '../infrastructure/password-hasher';
import { requirePortal } from '../members/cabinet-membership.service';
import {
    CabinetMembershipRepository,
    MembershipWithUser,
} from '../persistence/cabinet-membership.repository';
import {
    CabinetPortalRepository,
    toCabinetPortalRef,
} from '../persistence/cabinet-portal.repository';
import { CabinetTelegramBindingRepository } from '../persistence/cabinet-telegram-binding.repository';
import {
    CabinetAdminPortalCard,
    CabinetAdminService,
} from './cabinet-admin.service';
import { CabinetAppStatusService } from './cabinet-app-status.service';
import {
    CabinetOrganizationOverview,
    CabinetOrganizationPerson,
    CabinetOrganizationPortal,
    personName,
} from './cabinet-organization.view';

/** Новая организация с портала. */
export interface CreatePortalClientInput {
    name: string;
    /** Email организации — уникален на всю базу; пусто — без email. */
    email: string | null;
}

const isActiveMember = (row: MembershipWithUser): boolean =>
    row.revokedAt === null && row.role !== 'pending';

/**
 * Организация-клиент глазами админки April: завести её прямо с портала
 * (портал без клиента → «Создать организацию» → сразу привязан) и сводка
 * клиента — порталы с владельцем, участниками, Telegram и приложением,
 * люди и их порталы. Права проверяет контроллер (@Roles(SUPER_USER)).
 */
@Injectable()
export class CabinetOrganizationService {
    constructor(
        private readonly portals: CabinetPortalRepository,
        private readonly memberships: CabinetMembershipRepository,
        private readonly bindings: CabinetTelegramBindingRepository,
        private readonly hasher: PasswordHasher,
        private readonly appStatus: CabinetAppStatusService,
        private readonly admin: CabinetAdminService,
    ) {}

    async createForPortal(
        ctx: CabinetContext,
        input: CreatePortalClientInput,
    ): Promise<CabinetAdminPortalCard> {
        const portal = requirePortal(ctx);
        if (portal.clientId !== null) {
            throw new BadRequestException(
                'Портал уже привязан к организации — сначала отвяжите его',
            );
        }
        const name = input.name.trim();
        const email = input.email?.trim().toLowerCase() || null;
        if (email) {
            const taken = await this.portals.findClientByEmail(email);
            if (taken) {
                throw new ConflictException(
                    `Email ${email} уже у организации «${taken.name}» (#${taken.id}) — выберите её в списке`,
                );
            }
        }
        const client = await this.portals.createClient({ name, email });
        return this.admin.attachClient(ctx, Number(client.id));
    }

    async overview(clientId: number): Promise<CabinetOrganizationOverview> {
        const client = await this.portals.findClient(BigInt(clientId));
        if (!client) {
            throw new NotFoundException('Организация-клиент не найдена');
        }
        const portals = await this.portals.listByClient(client.id);
        const rows = await Promise.all(
            portals.map(portal => this.memberships.listByPortal(portal.id)),
        );
        const summaries = await Promise.all(
            portals.map((portal, index) =>
                this.portalSummary(portal, rows[index] ?? []),
            ),
        );
        return {
            clientId: Number(client.id),
            name: client.name,
            email: client.email,
            status: client.status,
            isActive: client.is_active !== false,
            portals: summaries,
            people: this.people(portals, rows),
        };
    }

    private async portalSummary(
        portal: Portal,
        rows: readonly MembershipWithUser[],
    ): Promise<CabinetOrganizationPortal> {
        const [telegram, app] = await Promise.all([
            this.bindings.listActiveByPortal(portal.id),
            this.appStatus.status(toCabinetPortalRef(portal)),
        ]);
        const owner = rows.find(
            row => row.role === 'owner' && row.revokedAt === null,
        );
        return {
            portalId: Number(portal.id),
            domain: portal.domain,
            approvalStatus: portal.approval_status,
            appInstalled: app.installed,
            bitrixAuthMode: app.bitrixAuthMode,
            owner: owner
                ? {
                      name: personName(owner.user),
                      email: owner.user.email,
                      hasPassword: this.hasher.isUsable(owner.user.password),
                  }
                : null,
            members: rows.filter(isActiveMember).length,
            pending: rows.filter(
                row => row.revokedAt === null && row.role === 'pending',
            ).length,
            telegram: telegram.length,
        };
    }

    /** Люди организации: учётка и в каких порталах у неё доступ. */
    private people(
        portals: readonly Portal[],
        rows: readonly (readonly MembershipWithUser[])[],
    ): CabinetOrganizationPerson[] {
        const byUser = new Map<string, CabinetOrganizationPerson>();
        portals.forEach((portal, index) => {
            for (const row of (rows[index] ?? []).filter(isActiveMember)) {
                const key = String(row.userId);
                const person = byUser.get(key) ?? {
                    userId: Number(row.userId),
                    name: personName(row.user),
                    email: row.user.email,
                    hasPassword: this.hasher.isUsable(row.user.password),
                    portals: [],
                };
                person.portals.push({
                    portalId: Number(portal.id),
                    domain: portal.domain,
                    role: row.role,
                });
                byUser.set(key, person);
            }
        });
        return [...byUser.values()];
    }
}
