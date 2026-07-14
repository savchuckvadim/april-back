import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/core';
import { decrypt, encrypt } from '@/shared/lib/utils/crypt.util';
import {
    marketplace_install_components,
    marketplace_installs,
    Portal,
} from 'generated/prisma';
import { MarketplaceComponentType } from '../config/marketplace-manifest';

/**
 * Хранилище маркетплейс-мира: portals (идентичность) + marketplace_installs
 * (установка и токены) + marketplace_install_components + bitrix_app_events.
 * Легаси-таблицы bitrix_apps/bitrix_tokens здесь НЕ используются.
 *
 * Шифрование токенов (access/refresh/application_token) — на стороне Nest
 * (crypt.util). portals.member_id — открытым текстом (unique-поиск).
 */

export interface UpsertPortalInput {
    memberId?: string;
    domain?: string;
}

export interface UpsertInstallTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    applicationToken?: string;
}

export interface UpsertInstallInput {
    portalId: bigint;
    appCode: string;
    domain?: string;
    lang?: string;
    scope?: string;
    tokens: UpsertInstallTokens;
}

export interface ComponentStateInput {
    productCode: string;
    componentType: MarketplaceComponentType;
    componentCode: string;
    status:
        | 'pending'
        | 'installing'
        | 'installed'
        | 'error'
        | 'unavailable'
        | 'skipped';
    reasonCode?: string;
    errorDetail?: string;
}

export interface EventLogInput {
    memberId?: string;
    domain?: string;
    event: string;
    status: 'received' | 'processed' | 'error';
    payload?: string;
    errorDetail?: string;
}

/** Установка с порталом и компонентами (admin-обзор) */
export type InstallWithDetails = marketplace_installs & {
    portals: Portal;
    marketplace_install_components: marketplace_install_components[];
};

/** Статусы установки (state machine, спецификация 4.5.2 плана) */
export enum InstallStatus {
    PENDING = 'pending',
    TOKENS_STORED = 'tokens_stored',
    EVENTS_BOUND = 'events_bound',
    PLACEMENTS_BOUND = 'placements_bound',
    BX_FINISHED = 'bx_finished',
    PROVISIONING = 'provisioning',
    INSTALLED = 'installed',
    ERROR = 'error',
}

@Injectable()
export class MarketplaceInstallRepository {
    private readonly logger = new Logger(MarketplaceInstallRepository.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Портал: member_id-first, fallback по domain; создание при первой
     * установке (source=marketplace, approval_status=pending).
     * Дозаполняет member_id у найденных по домену и обновляет domain
     * при его смене (домен изменяем, member_id — нет).
     */
    async upsertPortal(input: UpsertPortalInput): Promise<Portal> {
        const { memberId, domain } = input;

        let portal: Portal | null = null;
        if (memberId) {
            portal = await this.prisma.portal.findFirst({
                where: { member_id: memberId },
            });
        }
        if (!portal && domain) {
            portal = await this.prisma.portal.findFirst({
                where: { domain },
            });
        }

        if (!portal) {
            portal = await this.prisma.portal.create({
                data: {
                    domain,
                    member_id: memberId,
                    source: 'marketplace',
                    approval_status: 'pending',
                    number: 0,
                },
            });
            this.logger.log(
                `Portal created: id=${portal.id} domain=${domain ?? '-'} member_id=${memberId ?? '-'}`,
            );
            return portal;
        }

        const patch: { member_id?: string; domain?: string } = {};
        if (memberId && !portal.member_id) {
            patch.member_id = memberId; // дозаполнение у legacy-порталов
        }
        if (
            domain &&
            portal.domain !== domain &&
            portal.member_id === memberId
        ) {
            patch.domain = domain; // смена домена портала (ключ — member_id)
        }
        if (Object.keys(patch).length > 0) {
            portal = await this.prisma.portal.update({
                where: { id: portal.id },
                data: patch,
            });
        }
        return portal;
    }

    /** Идемпотентный upsert установки по (portal_id, app_code); токены шифруются */
    async upsertInstall(
        input: UpsertInstallInput,
    ): Promise<marketplace_installs> {
        const tokenData = {
            access_token: encrypt(input.tokens.accessToken),
            refresh_token: encrypt(input.tokens.refreshToken),
            expires_at: input.tokens.expiresAt,
            ...(input.tokens.applicationToken
                ? { application_token: encrypt(input.tokens.applicationToken) }
                : {}),
        };

        const existing = await this.prisma.marketplace_installs.findUnique({
            where: {
                portal_id_app_code: {
                    portal_id: input.portalId,
                    app_code: input.appCode,
                },
            },
        });

        if (existing) {
            return this.prisma.marketplace_installs.update({
                where: { id: existing.id },
                data: {
                    ...tokenData,
                    domain: input.domain ?? existing.domain,
                    lang: input.lang ?? existing.lang,
                    scope: input.scope ?? existing.scope,
                    uninstalled_at: null, // переустановка реактивирует запись
                    updated_at: new Date(),
                },
            });
        }

        return this.prisma.marketplace_installs.create({
            data: {
                id: randomUUID(),
                portal_id: input.portalId,
                app_code: input.appCode,
                domain: input.domain,
                lang: input.lang,
                scope: input.scope,
                install_status: InstallStatus.TOKENS_STORED,
                installed_at: new Date(),
                created_at: new Date(),
                updated_at: new Date(),
                ...tokenData,
            },
        });
    }

    async updateInstallStatus(
        installId: string,
        status: InstallStatus,
        errorStep?: string,
        errorDetail?: string,
    ): Promise<void> {
        await this.prisma.marketplace_installs.update({
            where: { id: installId },
            data: {
                install_status: status,
                error_step: errorStep ?? null,
                error_detail: errorDetail ?? null,
                updated_at: new Date(),
            },
        });
    }

    /** Установка по member_id портала (для guard'а событий и лицензий) */
    async findInstallByMemberId(
        memberId: string,
        appCode: string,
    ): Promise<(marketplace_installs & { portals: Portal }) | null> {
        return this.prisma.marketplace_installs.findFirst({
            where: {
                app_code: appCode,
                portals: { member_id: memberId },
            },
            include: { portals: true },
        });
    }

    /** Установка по текущему домену портала (для admin-операций) */
    async findInstallByDomain(
        domain: string,
        appCode: string,
    ): Promise<(marketplace_installs & { portals: Portal }) | null> {
        return this.prisma.marketplace_installs.findFirst({
            where: {
                app_code: appCode,
                portals: { domain },
            },
            include: { portals: true },
        });
    }

    /**
     * Все установки портала с компонентами (admin-диагностика).
     * member_id приоритетен; без фильтра по app_code — обзор всех
     * приложений портала. Токены НЕ расшифровываются.
     */
    async findInstallsWithComponents(filter: {
        domain?: string;
        memberId?: string;
    }): Promise<InstallWithDetails[]> {
        const portalWhere = filter.memberId
            ? { member_id: filter.memberId }
            : { domain: filter.domain };
        return this.prisma.marketplace_installs.findMany({
            where: { portals: portalWhere },
            include: {
                portals: true,
                marketplace_install_components: true,
            },
            orderBy: { updated_at: 'desc' },
        });
    }

    /** Расшифрованный access_token установки (для admin-refresh привязок) */
    getAccessToken(install: marketplace_installs): string | null {
        if (!install.access_token) {
            return null;
        }
        try {
            return decrypt(install.access_token);
        } catch {
            this.logger.warn(
                `access_token decrypt failed: install=${install.id}`,
            );
            return null;
        }
    }

    /** Расшифрованный application_token установки (для сверки событий) */
    getApplicationToken(install: marketplace_installs): string | null {
        if (!install.application_token) {
            return null;
        }
        try {
            return decrypt(install.application_token);
        } catch {
            this.logger.warn(
                `application_token decrypt failed: install=${install.id}`,
            );
            return null;
        }
    }

    /** ONAPPUNINSTALL: soft-delete (строка не удаляется, история сохраняется) */
    async markUninstalled(installId: string): Promise<void> {
        await this.prisma.marketplace_installs.update({
            where: { id: installId },
            data: { uninstalled_at: new Date(), updated_at: new Date() },
        });
    }

    /** ONAPPUPDATE: новая версия — scope, version и НОВЫЙ application_token */
    async applyUpdate(
        installId: string,
        data: { version?: string; scope?: string; applicationToken?: string },
    ): Promise<void> {
        await this.prisma.marketplace_installs.update({
            where: { id: installId },
            data: {
                version: data.version,
                scope: data.scope,
                ...(data.applicationToken
                    ? { application_token: encrypt(data.applicationToken) }
                    : {}),
                updated_at: new Date(),
            },
        });
    }

    /** По-компонентные статусы (upsert по уникальному ключу компонента) */
    async upsertComponents(
        installId: string,
        portalId: bigint,
        items: ComponentStateInput[],
    ): Promise<void> {
        for (const item of items) {
            await this.prisma.marketplace_install_components.upsert({
                where: {
                    marketplace_install_id_product_code_component_type_component_code:
                        {
                            marketplace_install_id: installId,
                            product_code: item.productCode,
                            component_type: item.componentType,
                            component_code: item.componentCode,
                        },
                },
                update: {
                    status: item.status,
                    reason_code: item.reasonCode ?? null,
                    error_detail: item.errorDetail ?? null,
                    attempts: { increment: 1 },
                    last_attempt_at: new Date(),
                    updated_at: new Date(),
                },
                create: {
                    id: randomUUID(),
                    marketplace_install_id: installId,
                    portal_id: portalId,
                    product_code: item.productCode,
                    component_type: item.componentType,
                    component_code: item.componentCode,
                    status: item.status,
                    reason_code: item.reasonCode,
                    error_detail: item.errorDetail,
                    attempts: 1,
                    last_attempt_at: new Date(),
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });
        }
    }

    /** Журнал входящих событий (payload — уже с маскированными токенами!) */
    async logEvent(input: EventLogInput): Promise<void> {
        try {
            await this.prisma.bitrix_app_events.create({
                data: {
                    id: randomUUID(),
                    member_id: input.memberId,
                    domain: input.domain,
                    event: input.event,
                    status: input.status,
                    payload: input.payload,
                    error_detail: input.errorDetail,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });
        } catch (error) {
            // журнал не должен ронять основной флоу
            this.logger.warn(
                `logEvent failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
}
