import { BadRequestException, Injectable } from '@nestjs/common';
import {
    AppPartCode,
    AppWidgetCode,
    EnumPortalAppCode,
    parseAppPartCodes,
    parseAppWidgetCodes,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    CabinetAccessLevel,
    CabinetRole,
    isCabinetRole,
} from '../domain/cabinet.constants';
import { CabinetContext } from '../domain/cabinet-context';
import { CabinetPortalRepository } from '../persistence/cabinet-portal.repository';
import { CabinetMembershipRepository } from '../persistence/cabinet-membership.repository';
import { CabinetUserRepository } from '../persistence/cabinet-user.repository';
import { PasswordHasher } from '../infrastructure/password-hasher';

/** Портал в списке «мои порталы». */
export interface CabinetPortalSummary {
    portalId: number;
    domain: string | null;
    organization: string | null;
    /** Допуск вендора: null — действующий (легаси) портал. */
    approvalStatus: string | null;
    role: CabinetRole | null;
}

/** Карточка портала в кабинете. */
export interface CabinetPortalOverview extends CabinetPortalSummary {
    level: CabinetAccessLevel;
    enabledParts: AppPartCode[];
    widgets: AppWidgetCode[];
}

/** Профиль учётки (вход с сайта). */
export interface CabinetProfile {
    userId: number;
    email: string | null;
    firstName: string;
    lastName: string;
    hasPassword: boolean;
    portals: CabinetPortalSummary[];
}

/**
 * Что показывает кабинет: мои порталы, карточка портала (части приложения
 * и виджеты из «Общих настроек портала»), профиль. Только чтение — права
 * уже проверил гард.
 */
@Injectable()
export class CabinetPortalService {
    constructor(
        private readonly portals: CabinetPortalRepository,
        private readonly memberships: CabinetMembershipRepository,
        private readonly users: CabinetUserRepository,
        private readonly settings: PortalAppSettingsService,
        private readonly hasher: PasswordHasher,
    ) {}

    async myPortals(ctx: CabinetContext): Promise<CabinetPortalSummary[]> {
        if (ctx.subject.kind === 'account') {
            const rows = await this.memberships.listActiveByUser(
                ctx.subject.userId,
            );
            return rows.map(row => ({
                portalId: Number(row.portal.id),
                domain: row.portal.domain,
                organization: row.portal.clients?.name ?? null,
                approvalStatus: row.portal.approval_status,
                role: isCabinetRole(row.role) ? row.role : null,
            }));
        }
        if (ctx.subject.kind === 'frame' && ctx.portal) {
            return [await this.summary(ctx)];
        }
        return [];
    }

    async overview(ctx: CabinetContext): Promise<CabinetPortalOverview> {
        const summary = await this.summary(ctx);
        const values = summary.domain
            ? await this.settings.resolve(
                  summary.domain,
                  EnumPortalAppCode.portal,
              )
            : null;
        return {
            ...summary,
            level: ctx.level,
            enabledParts: values ? parseAppPartCodes(values.enabledParts) : [],
            widgets: values ? parseAppWidgetCodes(values.appWidgets) : [],
        };
    }

    async profile(ctx: CabinetContext): Promise<CabinetProfile> {
        if (ctx.subject.kind !== 'account') {
            throw new BadRequestException(
                'Профиль есть только у учётной записи кабинета (вход с сайта)',
            );
        }
        const user = await this.users.findById(ctx.subject.userId);
        if (!user) {
            throw new BadRequestException('Учётная запись не найдена');
        }
        return {
            userId: Number(user.id),
            email: user.email,
            firstName: user.name,
            lastName: user.surname,
            hasPassword: this.hasher.isUsable(user.password),
            portals: await this.myPortals(ctx),
        };
    }

    private async summary(ctx: CabinetContext): Promise<CabinetPortalSummary> {
        const portal = ctx.portal;
        if (!portal) {
            throw new BadRequestException('Не указан портал');
        }
        const client =
            portal.clientId !== null
                ? await this.portals.findClient(portal.clientId)
                : null;
        return {
            portalId: Number(portal.id),
            domain: portal.domain,
            organization: client?.name ?? null,
            approvalStatus: portal.approvalStatus,
            role: ctx.membership?.role ?? null,
        };
    }
}
