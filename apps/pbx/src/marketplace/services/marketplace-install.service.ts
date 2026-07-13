import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import {
    BitrixInstallRequestSource,
    BitrixInstallTokenPayload,
    isInstallable,
    parseInstallParams,
} from '../lib/parse-install-params.util';
import { maskedJson } from '../lib/mask-payload.util';
import { MarketplaceInstallResultDto } from '../dto/marketplace-install.dto';
import {
    InstallStatus,
    MarketplaceInstallRepository,
} from '../persistence/marketplace-install.repository';
import { MarketplaceBxClient } from '../clients/marketplace-bx.client';
import { MarketplacePlacementSyncService } from './marketplace-placement-sync.service';
import {
    MARKETPLACE_LIFECYCLE_EVENTS,
    MarketplaceComponentType,
    SALES_SMART_SCENARIOS,
} from '../config/marketplace-manifest';

/**
 * Установка маркетплейс-приложения «Менеджер Гарант» — полный пайплайн:
 *
 *  [1] tokens_stored     — портал (member_id-first) + установка + токены
 *  [2] events_bound      — event.bind: ONAPPUNINSTALL/ONAPPUPDATE/ONAPPPAYMENT
 *  [3] placements_bound  — diff-синхронизация привязок виджетов
 *                          (эталон-манифест ↔ placement.list Битрикса)
 *  [4] умные сценарии    — ставит сам Битрикс из архива карточки решения;
 *                          здесь только фиксация состава (skipped/bitrix_archive)
 *  [5] installed         — provisioning pbx-сущностей: ЗАГЛУШКА (компонент
 *                          pbx_entities помечается pending; фактическая
 *                          установка и смена статусов — следующий этап)
 *
 * Хранение — ТОЛЬКО маркетплейс-таблицы (marketplace_installs и др.);
 * легаси bitrix_apps/bitrix_tokens не используются.
 * Любой шаг с ошибкой → install_status=error + error_step, но iframe-флоу
 * всё равно получает redirect (страница установки покажет ошибку).
 */
@Injectable()
export class MarketplaceInstallService {
    private readonly logger = new Logger(MarketplaceInstallService.name);

    /** Куда редиректить iframe мастера установки после сохранения */
    readonly installRedirectUrl: string;
    /** Публичный URL этого API (для HANDLER'ов event.bind/placement.bind) */
    readonly apiPublicUrl: string;

    readonly appCode = BITRIX_APP_CODES.GARANT as string;

    constructor(
        private readonly repository: MarketplaceInstallRepository,
        private readonly bxClient: MarketplaceBxClient,
        private readonly placementSync: MarketplacePlacementSyncService,
        private readonly configService: ConfigService,
    ) {
        this.installRedirectUrl =
            this.configService.get<string>(
                'MARKETPLACE_INSTALL_REDIRECT_URL',
            ) ?? 'https://bitrix.april-app.ru/install';
        this.apiPublicUrl =
            this.configService.get<string>('MARKETPLACE_API_PUBLIC_URL') ??
            'https://api.pbx.april-app.ru';
    }

    /**
     * Установка напрямую от Битрикса (оба канала: ONAPPINSTALL callback
     * и iframe мастера установки PLACEMENT=DEFAULT). Идемпотентно.
     */
    async installFromBitrixRequest(
        body: BitrixInstallRequestSource,
        query: BitrixInstallRequestSource,
    ): Promise<MarketplaceInstallResultDto> {
        const payload = parseInstallParams(body, query);
        await this.repository.logEvent({
            memberId: payload.member_id,
            domain: payload.domain,
            event: `INSTALL_${payload.channel.toUpperCase()}`,
            status: 'received',
            payload: maskedJson({ body, query }),
        });
        return this.runInstallPipeline(payload);
    }

    /**
     * Сохранение/обновление токенов из открытия приложения/плейсмента
     * (каждый запуск iframe несёт свежую пару AUTH_ID/REFRESH_ID).
     * Статус установки назад не откатывается — только токены/домен/lang.
     */
    async storeFromPayload(
        payload: BitrixInstallTokenPayload,
    ): Promise<MarketplaceInstallResultDto> {
        const base = this.baseResult(payload);
        if (!isInstallable(payload)) {
            return {
                ...base,
                message: 'Не хватает токенов в запросе открытия',
            };
        }
        try {
            const portal = await this.repository.upsertPortal({
                memberId: payload.member_id,
                domain: payload.domain,
            });
            const install = await this.repository.upsertInstall(
                this.buildUpsertInput(portal.id, payload),
            );
            return { ...base, status: 'success', appId: install.id };
        } catch (error) {
            this.logger.error(
                `storeFromPayload failed: domain=${payload.domain ?? '-'}`,
                error instanceof Error ? error.stack : String(error),
            );
            return {
                ...base,
                message: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /** Полный пайплайн установки (шаги 1–5, см. док-комментарий класса) */
    private async runInstallPipeline(
        payload: BitrixInstallTokenPayload,
    ): Promise<MarketplaceInstallResultDto> {
        const base = this.baseResult(payload);

        if (!isInstallable(payload)) {
            this.logger.warn(
                `Install rejected: channel=${payload.channel} domain=${payload.domain ?? '-'} — не хватает токенов`,
            );
            return {
                ...base,
                message: 'Не хватает токенов в запросе установки',
            };
        }

        const domain = payload.domain as string;
        const accessToken = payload.access_token as string;
        let step = 'tokens';
        let installId: string | undefined;

        try {
            // [1] Портал + установка + токены
            const portal = await this.repository.upsertPortal({
                memberId: payload.member_id,
                domain,
            });
            const install = await this.repository.upsertInstall(
                this.buildUpsertInput(portal.id, payload),
            );
            installId = install.id;

            // [2] События жизненного цикла
            step = 'events';
            await this.bindLifecycleEvents(domain, accessToken);
            await this.repository.updateInstallStatus(
                install.id,
                InstallStatus.EVENTS_BOUND,
            );

            // [3] Привязки виджетов: diff-синхронизация эталона с порталом
            step = 'placements';
            await this.placementSync.syncPlacements(
                domain,
                accessToken,
                install.id,
                portal.id,
            );
            await this.repository.updateInstallStatus(
                install.id,
                InstallStatus.PLACEMENTS_BOUND,
            );

            // [4] Умные сценарии — ЗАГЛУШКА (фиксируем состав, не устанавливаем)
            step = 'smart_scenarios';
            await this.registerSmartScenarioStubs(install.id, portal.id);

            // [5] Provisioning pbx-сущностей — ЗАГЛУШКА (следующий этап);
            // компонент фиксируется, статус установки завершаем.
            step = 'finish';
            await this.repository.upsertComponents(install.id, portal.id, [
                {
                    productCode: 'sales',
                    componentType: MarketplaceComponentType.PBX_ENTITIES,
                    componentCode: '',
                    status: 'pending',
                    reasonCode: 'stub',
                    errorDetail:
                        'Установка pbx-сущностей будет запускаться фоном (заглушка)',
                },
            ]);
            await this.repository.updateInstallStatus(
                install.id,
                InstallStatus.INSTALLED,
            );

            await this.repository.logEvent({
                memberId: payload.member_id,
                domain,
                event: `INSTALL_${payload.channel.toUpperCase()}`,
                status: 'processed',
            });
            this.logger.log(
                `Install completed: domain=${domain} member_id=${payload.member_id ?? '-'} install=${install.id}`,
            );
            return { ...base, status: 'success', appId: install.id };
        } catch (error) {
            const detail =
                error instanceof Error ? error.message : String(error);
            this.logger.error(
                `Install failed at step=${step}: domain=${domain}`,
                error instanceof Error ? error.stack : String(error),
            );
            if (installId) {
                await this.repository.updateInstallStatus(
                    installId,
                    InstallStatus.ERROR,
                    step,
                    detail,
                );
            }
            await this.repository.logEvent({
                memberId: payload.member_id,
                domain,
                event: `INSTALL_${payload.channel.toUpperCase()}`,
                status: 'error',
                errorDetail: `step=${step}: ${detail}`,
            });
            return { ...base, message: detail };
        }
    }

    /** event.bind lifecycle-событий на /api/bitrix-marketplace/event */
    private async bindLifecycleEvents(
        domain: string,
        accessToken: string,
    ): Promise<void> {
        const handler = `${this.apiPublicUrl}/api/bitrix-marketplace/event`;
        for (const event of MARKETPLACE_LIFECYCLE_EVENTS) {
            const result = await this.bxClient.bindEvent(
                domain,
                accessToken,
                event,
                handler,
            );
            if (!result.ok) {
                throw new Error(
                    `event.bind ${event} failed: ${result.error ?? ''} ${result.errorDescription ?? ''}`,
                );
            }
        }
    }

    /**
     * Умные сценарии ставит сам Битрикс из архива, приложенного к карточке
     * решения (экспорт с портала вендора) — бэк их НЕ устанавливает.
     * Здесь только фиксация состава для экрана прогресса.
     */
    private async registerSmartScenarioStubs(
        installId: string,
        portalId: bigint,
    ): Promise<void> {
        await this.repository.upsertComponents(
            installId,
            portalId,
            SALES_SMART_SCENARIOS.map(scenario => ({
                productCode: scenario.product,
                componentType: MarketplaceComponentType.SMART_SCENARIO,
                componentCode: scenario.code,
                status: 'skipped' as const,
                reasonCode: 'bitrix_archive',
                errorDetail: `Сценарий «${scenario.title}» устанавливается Битриксом из архива карточки решения`,
            })),
        );
    }

    private buildUpsertInput(
        portalId: bigint,
        payload: BitrixInstallTokenPayload,
    ) {
        return {
            portalId,
            appCode: this.appCode,
            domain: payload.domain,
            lang: payload.lang,
            tokens: {
                accessToken: payload.access_token as string,
                refreshToken: payload.refresh_token as string,
                expiresAt: new Date(
                    Date.now() + (payload.expires_in ?? 3600) * 1000,
                ),
                applicationToken: payload.application_token,
            },
        };
    }

    private baseResult(
        payload: BitrixInstallTokenPayload,
    ): MarketplaceInstallResultDto {
        return {
            status: 'fail',
            channel: payload.channel,
            domain: payload.domain,
            memberId: payload.member_id,
        };
    }
}
