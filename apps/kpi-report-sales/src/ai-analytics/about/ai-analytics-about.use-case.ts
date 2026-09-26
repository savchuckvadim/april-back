import { Injectable, Logger } from '@nestjs/common';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_CACHE_PREFIX } from '../constants/ai-analytics.const';
import type { RequesterAccess } from '../domain/access/perimeter.util';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import { AiAnalyticsParamsLoader } from '../domain/loaders/params.loader';
import type {
    AiAboutRequestDto,
    AiAboutResponseDto,
} from '../dto/ai-about.dto';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    buildAiAnalyticsAbout,
    type AiAboutModelSource,
} from './ai-analytics-about.builder';
import type { AiAboutGoldenSource } from './ai-analytics-about-reliability.builder';
import {
    AI_ABOUT_KEY_SECTION,
    AI_ABOUT_MODEL_REASONS,
    type AiAboutEndpoint,
} from './ai-analytics-about.const';

/** Ключ конверта: `sales-ai-analytics:v1:{domain}:about:{endpoint}`. */
export const buildAboutKey = (
    domain: string,
    endpoint: AiAboutEndpoint,
): string =>
    `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${AI_ABOUT_KEY_SECTION}:${endpoint}`;

/**
 * Блок «Как считаем» для ручки витрины: контекст реестра портала
 * (`AiAnalyticsParamsLoader`) + последняя модель портала из `ais`
 * (`AiAnalyticsSnapshotStore.latestModel`) → билдер. Синхронно и легко:
 * одно чтение настроек и одна выборка снапшота, Битрикс не зовётся.
 *
 * Хранилище не ответило — блок собирается по реестру с причиной (§5.4):
 * объяснение расчёта не должно гаснуть из-за недоступной `ais`.
 *
 * Менеджеру в self_view (B13, решение владельца 22.09.2026) блок отдаётся
 * целиком — тот же состав, что руководителю; периметр уже проверен
 * контроллером (`resolveViewer`), здесь роль лишь помечает ответ
 * признаком `selfView`, по которому фронт сворачивает детали параметров.
 *
 * `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class AiAnalyticsAboutUseCase {
    private readonly logger = new Logger(AiAnalyticsAboutUseCase.name);

    constructor(
        private readonly params: AiAnalyticsParamsLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async execute(
        dto: AiAboutRequestDto,
        access: RequesterAccess,
    ): Promise<AiAboutResponseDto> {
        const [params, model, goldenReport] = await Promise.all([
            this.params.load(dto.domain),
            this.loadModel(dto.domain),
            this.loadGoldenReport(dto.domain),
        ]);
        return {
            status: 'ready',
            requestKey: buildAboutKey(dto.domain, dto.endpoint),
            data: buildAiAnalyticsAbout({
                endpoint: dto.endpoint,
                registry: params.ctx,
                paramsVersion: params.paramsVersion,
                comparableFrom: params.comparableFrom,
                model: model.source,
                ...(model.reason === null ? {} : { modelReason: model.reason }),
                goldenReport,
                selfView: access.role === 'manager',
            }),
        };
    }

    /** Последний отчёт согласия оценщика (П7); нет или ошибка стора — null. */
    private async loadGoldenReport(
        domain: string,
    ): Promise<AiAboutGoldenSource | null> {
        try {
            const record = await this.snapshots.latest(
                domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.goldenReport,
                null,
            );

            return record === null
                ? null
                : { payload: record.payload, generatedAt: record.generatedAt };
        } catch (error) {
            this.logger.warn(
                `Отчёт согласия ${domain} для блока «Как считаем» не прочитан: ${String(error)}`,
            );

            return null;
        }
    }

    /** Последняя модель портала; ошибка стора — null с причиной. */
    private async loadModel(
        domain: string,
    ): Promise<{ source: AiAboutModelSource | null; reason: string | null }> {
        try {
            const record = await this.snapshots.latestModel(domain);
            return record === null
                ? { source: null, reason: null }
                : {
                      source: {
                          id: record.id,
                          payload:
                              record.payload as Partial<PortalModelPayload>,
                      },
                      reason: null,
                  };
        } catch (error) {
            this.logger.warn(
                `Модель портала ${domain} для блока «Как считаем» не прочитана: ${String(error)}`,
            );
            return { source: null, reason: AI_ABOUT_MODEL_REASONS.unavailable };
        }
    }
}
