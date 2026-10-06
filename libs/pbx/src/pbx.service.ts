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
import { TimedCache } from '@lib/shared';
import { PortalAppSettingsService } from '@lib/portal-lib/store/app-settings';
import { PortalRateLimitResolver } from './lib/portal-rate-limit.resolver';
import { fillPortalGapsFromInternal } from './lib/portal-gap-fill';
import { PBX_INIT_STEP, countInit, timeInitStep } from './lib/pbx-init-metrics';

/**
 * Сколько локальная сборка портала живёт в памяти процесса. Константа, без
 * переменной окружения (06.10.2026): правка полей портала доезжает до
 * приложений за минуту, а кэш модели переделываем вместе с PortalModel.
 */
const INTERNAL_PORTAL_TTL_MS = 60_000;

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
        // Лимит запросов к Битриксу из «Общих настроек портала». Optional:
        // без PortalAppSettingsModule — значения по умолчанию ограничителя.
        @Optional()
        appSettings?: PortalAppSettingsService,
    ) {
        this.rateLimits = new PortalRateLimitResolver(appSettings, this.logger);
    }

    /** Лимит запросов портала к Битриксу — из его настроек. */
    private readonly rateLimits: PortalRateLimitResolver;

    /**
     * Локальная сборка портала из БД — около 19 SQL-запросов. Раньше она
     * выполнялась на КАЖДЫЙ init (а их 7–8 на одно открытие сделки и
     * десятки в фоновых задачах), хотя модель меняется, только когда на
     * портал ставят поля. Теперь собранная модель живёт в памяти процесса
     * минуту, а параллельные init одного домена ждут одну сборку (разбор
     * нагрузки 05.10.2026).
     *
     * Кэшируются только ДАННЫЕ. Экземпляр Bitrix по-прежнему создаётся на
     * каждый init и ни с кем не делится (правило проекта).
     */
    private readonly internalPortalCache = new TimedCache<IPortal>(
        INTERNAL_PORTAL_TTL_MS,
    );

    async init(domain: string, authType: BxAuthType = BxAuthType.HOOK) {
        countInit(domain);
        return timeInitStep(PBX_INIT_STEP.total, () =>
            this.initSteps(domain, authType),
        );
    }

    /** Шаги init — каждый со своим замером (см. pbx-init-metrics). */
    private async initSteps(domain: string, authType: BxAuthType) {
        const internalPortal = await timeInitStep(
            PBX_INIT_STEP.internalPortal,
            () => this.getInternalPortal(domain),
        );

        const isMarketplace = await timeInitStep(
            PBX_INIT_STEP.marketplaceCheck,
            () => this.isMarketplacePortal(domain),
        );
        if (isMarketplace) {
            return this.initMarketplace(domain, internalPortal);
        }

        const externalPortal = await timeInitStep(
            PBX_INIT_STEP.externalPortal,
            () => this.portal.getPortalByDomain(domain),
        );
        // Внешний слепок бывает неполным — пустые секции берутся из
        // локальной сборки (правило — fillPortalGapsFromInternal).
        const { portal, filled } = fillPortalGapsFromInternal(
            externalPortal,
            internalPortal,
        );
        if (filled.length) {
            this.logger.log(
                `[portal] ${domain}: внешний слепок неполон (${filled.join(', ')}) — данные взяты из локальной сборки (БД)`,
            );
        }
        const PortalModel = await timeInitStep(PBX_INIT_STEP.portalModel, () =>
            this.modelFactory.create(portal),
        );

        const bitrix = await timeInitStep(
            PBX_INIT_STEP.bitrixClient,
            async () =>
                this.bitrixFactory.create(
                    {
                        domain: portal.domain,
                        key: portal.key,
                        rateLimit: await this.rateLimits.resolve(domain),
                    },
                    authType,
                ),
        ); // ← полноценный BitrixService

        return {
            bitrix,
            portal,
            PortalModel,
            internalPortal,
        };
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
        // Потребитель считает модель неполной — локальная сборка тоже
        // перечитывается из БД, а не берётся из минутного кэша.
        this.internalPortalCache.delete(domain);
        await this.portal.refreshByDomain(domain);
        return this.init(domain, authType);
    }

    /**
     * Локальная модель портала: из минутного кэша или сборкой из БД.
     *
     * Каждый вызов получает СВОЮ копию: потребители достраивают и правят
     * модель под себя, и общий объект протекал бы между запросами и
     * порталами. Копия стоит миллисекунды, сборка — десятки запросов в БД.
     */
    private async getInternalPortal(
        domain: string,
    ): Promise<IPortal | undefined> {
        const cached = await this.internalPortalCache.get(domain, () =>
            this.buildInternalPortal(domain),
        );
        if (cached === undefined) return undefined;
        try {
            return structuredClone(cached);
        } catch (error) {
            // Модель с неклонируемым содержимым — редкость, но ронять init
            // из-за кэша нельзя: отдаём сборку как есть и больше не храним.
            this.internalPortalCache.delete(domain);
            this.logger.warn(
                `internal-portal ${domain}: копия не снялась (${
                    error instanceof Error ? error.message : String(error)
                }) — кэш для домена сброшен`,
            );
            return cached;
        }
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
            {
                domain,
                accessToken,
                rateLimit: await this.rateLimits.resolve(domain),
            },
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
