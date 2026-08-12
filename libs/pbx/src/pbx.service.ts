import { PortalService } from '@lib/portal-lib/portal/portal.service';
import { PortalModelFactory } from '@lib/portal-lib/portal/factory/potal-model.factory';
import { IPortal } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { BackendPortalBuilderService } from '@lib/portal-lib/builder';
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
    MarketplaceAuthRepository,
    MarketplaceTokenService,
} from '@lib/marketplace-core';
import {
    BitrixServiceFactory,
    BxAuthType,
} from '@/modules/bitrix/bitrix-service.factory';

/**
 * Точка входа в Bitrix-мир по домену портала. Два пути авторизации:
 *
 * 1. МАРКЕТПЛЕЙС (приоритетный, если у домена есть активная установка
 *    в marketplace_installs): OAuth access_token с авто-refresh через
 *    MarketplaceTokenService; портал синтезируется из локальной portals —
 *    legacy online-API и вебхук НЕ используются (у маркетплейс-порталов
 *    их нет). Отключается env PBX_MARKETPLACE_AUTH_FIRST=false.
 *
 * 2. LEGACY: портал из online-API (кэш Redis) + вебхук (BxAuthType.HOOK) —
 *    без изменений.
 *
 * Инстанс bitrix создаётся per-call и НЕ оседает в this (batch-команды
 * копятся в том инстансе, который вернул init — см. правила проекта).
 *
 * init() дополнительно отдаёт `internalPortal` — локально собранную из БД
 * модель IPortal (backend-builder). Это задел для отказа от внешнего Laravel-
 * портала: пока внешний (`portal`) и внутренний (`internalPortal`) отдаются
 * оба, потребители переключаются на внутренний поштучно. Сборка best-effort:
 * если локальных данных нет — internalPortal = undefined, init не падает.
 */
@Injectable()
export class PBXService {
    private readonly logger = new Logger(PBXService.name);

    constructor(
        private readonly bitrixFactory: BitrixServiceFactory,
        private readonly portal: PortalService,
        private readonly modelFactory: PortalModelFactory,
        // Маркетплейс-путь опционален: без MarketplaceCoreModule (юнит-тесты,
        // приложения без либы) работает только legacy-ветка.
        @Optional()
        private readonly marketplaceToken?: MarketplaceTokenService,
        @Optional()
        private readonly marketplaceAuth?: MarketplaceAuthRepository,
        // Локальная сборка IPortal из БД. Optional: без PortalBuilderModule
        // (юнит-тесты, приложения без либы) internalPortal просто undefined.
        @Optional()
        private readonly portalBuilder?: BackendPortalBuilderService,
    ) {}

    async init(domain: string, authType: BxAuthType = BxAuthType.HOOK) {
        const internalPortal = await this.buildInternalPortal(domain);

        if (await this.isMarketplacePortal(domain)) {
            return this.initMarketplace(domain, internalPortal);
        }

        const externalPortal = await this.portal.getPortalByDomain(domain);
        const portal = this.fillGapsFromInternal(
            domain,
            externalPortal,
            internalPortal,
        );
        const PortalModel = this.modelFactory.create(portal);

        const bitrix = await this.bitrixFactory.create(
            { domain: portal.domain, key: portal.key },
            authType,
        ); // ← полноценный BitrixService

        return {
            bitrix,
            portal,
            PortalModel,
            internalPortal,
        };
    }

    /**
     * Достраивает внешний слепок портала данными ЛОКАЛЬНОЙ сборки из нашей БД.
     *
     * Зачем: внешний Laravel-`getportal` отдаёт не все секции — на реальных
     * порталах у него бывает пустой `lead` (а поля лида pbx-install пишет
     * именно в нашу БД). Потребитель в этом случае считает поля
     * «неустановленными» и МОЛЧА пропускает записи: ни ошибки, ни данных.
     *
     * Правило простое и безопасное: секция берётся из локальной сборки,
     * только если внешняя ПУСТА. Внешние данные никогда не перетираются —
     * пока Laravel остаётся источником истины, он же и приоритетный.
     */
    private fillGapsFromInternal(
        domain: string,
        external: IPortal,
        internal?: IPortal,
    ): IPortal {
        if (!internal) return external;

        const filled: string[] = [];
        const portal: IPortal = { ...external };

        portal.lead = this.mergeEntitySection(
            external.lead,
            internal.lead,
            'lead',
            filled,
        );
        portal.company = this.mergeEntitySection(
            external.company,
            internal.company,
            'company',
            filled,
        );
        portal.contact = this.mergeEntitySection(
            external.contact,
            internal.contact,
            'contact',
            filled,
        );
        if (!external.deals?.length && internal.deals?.length) {
            portal.deals = internal.deals;
            filled.push('deals');
        }

        if (filled.length) {
            this.logger.log(
                `[portal] ${domain}: внешний слепок неполон (${filled.join(', ')}) — данные взяты из локальной сборки (БД)`,
            );
        }
        return portal;
    }

    /**
     * Достройка ОДНОЙ секции сущности: поля и категории берутся из локальной
     * сборки независимо друг от друга — у внешнего портала встречается и
     * полностью отсутствующая секция, и секция с полями, но без стадий
     * (тогда «стадия не установлена» ломает SLA и движение статусов).
     */
    private mergeEntitySection<
        T extends { bitrixfields?: unknown[]; categories?: unknown[] },
    >(
        external: T | undefined,
        internal: T | undefined,
        label: string,
        filled: string[],
    ): T | undefined {
        if (!internal) return external;
        if (!external) {
            if (internal.bitrixfields?.length || internal.categories?.length) {
                filled.push(label);
                return internal;
            }
            return external;
        }

        const section = { ...external };
        if (!external.bitrixfields?.length && internal.bitrixfields?.length) {
            section.bitrixfields = internal.bitrixfields;
            filled.push(`${label}.fields`);
        }
        if (!external.categories?.length && internal.categories?.length) {
            section.categories = internal.categories;
            filled.push(`${label}.stages`);
        }
        return section;
    }

    /**
     * То же, что init(), но со СБРОСОМ кэша слепка портала.
     *
     * Нужен, когда потребитель обнаружил заведомо неполный слепок (например,
     * у портала не видно ни одного UF-поля лида, хотя они установлены):
     * слепок кэшируется на 10 часов, и без сброса записи молча теряются.
     * У самого сброса есть кулдаун (PortalService), поэтому вызов безопасен.
     */
    async initFresh(domain: string, authType: BxAuthType = BxAuthType.HOOK) {
        await this.portal.refreshByDomain(domain);
        return this.init(domain, authType);
    }

    /** Локальная модель портала из БД (best-effort — нет данных/ошибка → undefined). */
    private async buildInternalPortal(
        domain: string,
    ): Promise<IPortal | undefined> {
        if (!this.portalBuilder) {
            return undefined;
        }
        try {
            return await this.portalBuilder.buildByDomain(domain);
        } catch (error) {
            this.logger.warn(
                `internal-portal сборка не удалась (${domain}): ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return undefined;
        }
    }

    /** Есть ли у домена активная маркетплейс-установка (кэш Redis в сервисе) */
    private async isMarketplacePortal(domain: string): Promise<boolean> {
        if (
            !this.marketplaceToken ||
            process.env.PBX_MARKETPLACE_AUTH_FIRST === 'false'
        ) {
            return false;
        }
        try {
            return await this.marketplaceToken.hasActiveInstall(domain);
        } catch (error) {
            this.logger.warn(
                `marketplace-детект не удался (${domain}), fallback на legacy: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return false;
        }
    }

    /** OAuth-путь маркетплейса: без online-API и вебхука */
    private async initMarketplace(domain: string, internalPortal?: IPortal) {
        const accessToken = await this.marketplaceToken!.getFreshAccessToken({
            domain,
        });
        const bitrix = await this.bitrixFactory.create(
            { domain, accessToken },
            BxAuthType.TOKEN,
        );

        const install = await this.marketplaceAuth?.findActiveInstall({
            domain,
        });
        const portal = this.buildMarketplacePortal(domain, install?.portals.id);
        const PortalModel = this.modelFactory.create(portal);

        return { bitrix, portal, PortalModel, internalPortal };
    }

    /**
     * Синтезированный IPortal маркетплейс-портала: идентичность — локальная
     * таблица portals (id нужен зеркалам PortalDB); вебхук-полей нет —
     * потребители маркетплейс-пути работают только через bitrix (OAuth).
     */
    private buildMarketplacePortal(domain: string, portalId?: bigint): IPortal {
        return {
            domain,
            id: portalId !== undefined ? Number(portalId) : undefined,
            apiKey: '',
            key: '',
            C_REST_WEB_HOOK_URL: '',
            C_REST_CLIENT_SECRET: '',
            C_REST_CLIENT_ID: '',
            deals: [],
            measures: [],
        };
    }
}
