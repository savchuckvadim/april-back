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

        const portal = await this.portal.getPortalByDomain(domain);
        const PortalModel = await this.portal.getModelByDomain(domain);

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
