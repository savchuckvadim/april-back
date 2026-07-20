import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/core';
import { decrypt, encrypt } from '@/shared/lib/utils/crypt.util';
import {
    ComponentStateInput,
    MarketplaceComponentStateRepository,
} from '@lib/marketplace-core';
import {
    Client,
    marketplace_install_components,
    marketplace_installs,
    Portal,
    portal_invites,
    portal_products,
} from 'generated/prisma';

// Тип входа компонент-статусов переехал в @lib/marketplace-core (общий с
// воркером pbx-install); ре-экспорт сохраняет существующие импорты модуля.
export type { ComponentStateInput } from '@lib/marketplace-core';

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

    constructor(
        private readonly prisma: PrismaService,
        private readonly componentState: MarketplaceComponentStateRepository,
    ) {}

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

    /**
     * Установка + портал + привязанный клиент (для сессии/онбординга:
     * состояние допуска вычисляется из approval_status и наличия клиента).
     */
    async findInstallWithClient(
        memberId: string,
        appCode: string,
    ): Promise<
        | (marketplace_installs & {
              portals: Portal & { clients: Client | null };
          })
        | null
    > {
        return this.prisma.marketplace_installs.findFirst({
            where: {
                app_code: appCode,
                portals: { member_id: memberId },
            },
            include: { portals: { include: { clients: true } } },
        });
    }

    /**
     * Онбординг-заявка: создать клиента и привязать к порталу, либо
     * (повторная подача до одобрения) обновить название/email —
     * идемпотентный upsert (решение открытого вопроса №5 задачи онбординга).
     */
    async linkClient(
        portalId: bigint,
        data: { organizationName: string; contactEmail: string },
    ): Promise<Client> {
        const portal = await this.prisma.portal.findUnique({
            where: { id: portalId },
        });

        if (portal?.client_id) {
            return this.prisma.client.update({
                where: { id: portal.client_id },
                data: {
                    name: data.organizationName,
                    email: data.contactEmail,
                    updated_at: new Date(),
                },
            });
        }

        const client = await this.prisma.client.create({
            data: {
                name: data.organizationName,
                email: data.contactEmail,
                status: 'pending',
                is_active: true,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
        await this.prisma.portal.update({
            where: { id: portalId },
            data: { client_id: client.id },
        });
        this.logger.log(
            `Onboarding: клиент #${client.id} привязан к порталу #${portalId}`,
        );
        return client;
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

    /**
     * Активация/деактивация продукта на портале — идемпотентный upsert
     * по (portal_id, product_code). activated_at ставится при первом
     * переходе в active и не перетирается повторным approve.
     */
    async upsertPortalProduct(
        portalId: bigint,
        productCode: string,
        status: 'active' | 'inactive' | 'suspended',
    ): Promise<portal_products> {
        const existing = await this.prisma.portal_products.findUnique({
            where: {
                portal_id_product_code: {
                    portal_id: portalId,
                    product_code: productCode,
                },
            },
        });
        if (existing) {
            return this.prisma.portal_products.update({
                where: { id: existing.id },
                data: {
                    status,
                    activated_at:
                        status === 'active' && !existing.activated_at
                            ? new Date()
                            : existing.activated_at,
                    updated_at: new Date(),
                },
            });
        }
        return this.prisma.portal_products.create({
            data: {
                id: randomUUID(),
                portal_id: portalId,
                product_code: productCode,
                status,
                activated_at: status === 'active' ? new Date() : null,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
    }

    /** Продукты портала (кабинет/админка) */
    async findPortalProducts(portalId: bigint): Promise<portal_products[]> {
        return this.prisma.portal_products.findMany({
            where: { portal_id: portalId },
            orderBy: { product_code: 'asc' },
        });
    }

    /** Смена статуса допуска портала (approve/block онбординга) */
    async setApprovalStatus(
        portalId: bigint,
        status: 'approved' | 'blocked' | 'pending',
        approvedBy?: string,
    ): Promise<void> {
        await this.prisma.portal.update({
            where: { id: portalId },
            data: {
                approval_status: status,
                ...(status === 'approved'
                    ? { approved_at: new Date(), approved_by: approvedBy }
                    : {}),
            },
        });
    }

    /**
     * Код подключения по хэшу — только «живой» (не погашен, не отозван,
     * не истёк). Сам код нигде не хранится, ищем строго по sha256.
     */
    async findRedeemableInvite(
        codeHash: string,
    ): Promise<portal_invites | null> {
        return this.prisma.portal_invites.findFirst({
            where: {
                code_hash: codeHash,
                status: { in: ['issued', 'sent'] },
                OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
            },
        });
    }

    /** Пометить код погашенным (одноразовость) */
    async markInviteRedeemed(
        inviteId: string,
        portalId: bigint,
    ): Promise<void> {
        await this.prisma.portal_invites.update({
            where: { id: inviteId },
            data: {
                status: 'redeemed',
                redeemed_at: new Date(),
                redeemed_portal_id: portalId,
                updated_at: new Date(),
            },
        });
    }

    /** Привязать портал к клиенту, выпустившему код, и активировать клиента */
    async attachClientToPortal(
        portalId: bigint,
        clientId: bigint,
    ): Promise<Client> {
        await this.prisma.portal.update({
            where: { id: portalId },
            data: { client_id: clientId },
        });
        return this.prisma.client.update({
            where: { id: clientId },
            data: {
                status: 'active',
                is_active: true,
                updated_at: new Date(),
            },
        });
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

    /**
     * По-компонентные статусы — делегируется общему репозиторию
     * @lib/marketplace-core (тот же код пишет и воркер provisioning).
     */
    async upsertComponents(
        installId: string,
        portalId: bigint,
        items: ComponentStateInput[],
    ): Promise<void> {
        await this.componentState.upsertComponents(installId, portalId, items);
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
