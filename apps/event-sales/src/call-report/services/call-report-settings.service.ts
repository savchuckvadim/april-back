import { Injectable, Logger } from '@nestjs/common';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import {
    PortalAiSettingsRecord,
    PresentationStrictnessLevel,
} from '@lib/portal-lib/store/ai-settings/portal-ai-settings.types';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    minDurationByTypeOfSettings,
    minDurationFloorSec,
    minDurationSecOf,
    type MinDurationSecByType,
} from '@lib/sales-ai-analytics';

/**
 * Дефолты кода — действуют, пока настройка не задана на портале.
 * Env-слоя БОЛЬШЕ НЕТ (решение владельца 2026-08-04): весь конвейер
 * управляется из админки (portal_ai_settings), деплой для смены настроек
 * не нужен. Единственный «выключатель» — enabled портала в БД.
 */
const DEFAULTS = {
    /** Портал обрабатывается только при ЯВНОМ включении в админке. */
    enabled: false,
    deepAnalysisEnabled: true,
    createSmartEnabled: true,
    classifyEnabled: true,
    salesOnly: true,
    // minDurationSec дефолта здесь НЕТ намеренно: порог общий с
    // AI-аналитикой и приходит из реестра параметров
    // (`min_duration_sec_by_type`) — см. minDurationByType ниже.
    windowHours: 25,
    maxPerRun: 10,
    staleMinutes: 90,
    llmModel: 'gigachat',
    /** Порог гейта нерелевантности (см. CallReportPipelineUseCase). */
    irrelevantConfidence: 0.7,
    /** Ночной ревизор удваивает LLM-расход — включается сознательно. */
    revisorEnabled: false,
    /** Утренняя сверка отчёта менеджера с разбором презентации. */
    presentationAuditEnabled: false,
    /** Строгость определения презентации: по умолчанию строго. */
    presentationStrictness: 'strict' as PresentationStrictnessLevel,
    /**
     * Проверка по документам компании: лишний вызов модели на звонок и
     * бессмысленна без загруженных материалов — включается сознательно.
     */
    complianceReviewEnabled: false,
} as const;

/**
 * Названий своих организаций по умолчанию НЕТ: пустой список означает
 * прежнее поведение промптов (ни строчки про «наши имена»).
 */
const NO_OWN_ORG_NAMES: readonly string[] = [];

/**
 * Эффективные настройки конвейера для конкретного портала: ни одного null
 * в обязательных полях, всё готово к использованию.
 */
export interface EffectiveCallReportSettings {
    /** Обрабатывать ли звонки портала (false, пока админ не включил). */
    enabled: boolean;
    deepAnalysisEnabled: boolean;
    createSmartEnabled: boolean;
    classifyEnabled: boolean;
    salesOnly: boolean;
    /**
     * Порог разбора для этапов, где ТИП ЗВОНКА ЕЩЁ НЕ ИЗВЕСТЕН (выборка
     * звонков из Битрикса в CallReportScanUseCase): минимум по карте
     * `minDurationSecByType`. Порог конкретного типа — `minDurationFor`.
     */
    minDurationSec: number;
    /**
     * Пороги разбора по типам звонка (решение владельца А.1: порог — только
     * фильтр, тип он не назначает). Источник тот же, что у пульса и витрины:
     * настройки [kpiSales] портала → код реестра `min_duration_sec_by_type`.
     */
    minDurationSecByType: MinDurationSecByType;
    windowHours: number;
    maxPerRun: number;
    staleMinutes: number;
    llmModel: string;
    /** null — глубокий разбор идёт на модели по умолчанию своего провайдера. */
    deepAnalysisModel: string | null;
    /** null — портал сканируется на каждом тике планировщика. */
    scanIntervalMinutes: number | null;
    nightScanIntervalMinutes: number | null;
    nightStartHour: number | null;
    nightEndHour: number | null;
    lastScanAt: Date | null;
    /** null — анализируется весь отдел продаж. */
    allowedUserIds: number[] | null;
    /** Порог гейта нерелевантности 0..1. */
    irrelevantConfidence: number;
    /** Ночной ревизор (свод по сущностям). */
    revisorEnabled: boolean;
    /** Утренняя сверка отчёта менеджера с разбором презентации. */
    presentationAuditEnabled: boolean;
    /**
     * Строгость определения презентации (тип звонка и всё вытекающее):
     * strict / normal / soft — см. PRESENTATION_STRICTNESS_LEVELS.
     */
    presentationStrictness: PresentationStrictnessLevel;
    /** Проверка звонка по документам компании (скрипт, регламент, факты). */
    complianceReviewEnabled: boolean;
    /**
     * Названия НАШИХ организаций: как менеджеры представляются клиенту на
     * этом портале («Альфа-центр», «Апрель»). Пустой массив — настройка не
     * задана, промпты остаются прежними.
     */
    ownOrgNames: string[];
    /** Откуда взялись значения — для диагностики в логах. */
    source: 'portal' | 'default';
}

/**
 * Склейка настроек конвейера: **портал → дефолт кода** (без env).
 *
 * Настройки портала опциональны: незаданное поле работает на дефолте кода.
 * Недоступность БД не роняет конвейер — но без строки настроек портал
 * просто не обрабатывается (enabled=false по умолчанию).
 *
 * Исключение — порог длительности: он общий с AI-аналитикой ОП (решение
 * владельца А.1, находка M12 аудита Фазы 2) и резолвится из настроек
 * [kpiSales] портала (`ai_analytics_definitions` / `ai_analytics_model_params`
 * → код реестра `min_duration_sec_by_type`). Настроек [kpiSales] нет —
 * работает прежний скаляр `PortalAiSettings.minDurationSec`, нет и его —
 * дефолт реестра (300 с). Иначе порог пульса и порог конвейера разъезжаются.
 */
@Injectable()
export class CallReportSettingsService {
    private readonly logger = new Logger(CallReportSettingsService.name);

    constructor(
        private readonly portalAiSettings: PortalAiSettingsService,
        private readonly appSettings: PortalAppSettingsService,
    ) {}

    /** Эффективные настройки домена. Недоступность БД не роняет конвейер. */
    async resolve(domain: string): Promise<EffectiveCallReportSettings> {
        const portal = await this.portalAiSettings
            .getByDomain(domain)
            .catch((error: Error) => {
                this.logger.warn(
                    `Настройки портала ${domain} не прочитаны (${error.message}) — работаю на дефолтах`,
                );
                return null;
            });
        return this.merge(portal, await this.minDurationByType(domain, portal));
    }

    /**
     * Порог разбора для типа звонка, с. Тип ещё не определён (выборка из
     * Битрикса до классификации) — МИНИМУМ по карте: звонок короче него не
     * проходит порог ни одного типа, а окончательный отсев делается, когда
     * тип известен.
     */
    async minDurationFor(
        domain: string,
        callType?: string | null,
    ): Promise<number> {
        const { minDurationSecByType } = await this.resolve(domain);

        return callType
            ? minDurationSecOf(callType, minDurationSecByType)
            : minDurationFloorSec(minDurationSecByType);
    }

    /** Дефолты кода без обращения к БД — для глобальных процедур и логов. */
    globals(): EffectiveCallReportSettings {
        return this.merge(null, minDurationByTypeOfSettings(null));
    }

    /**
     * Карта порогов портала: настройки [kpiSales] → запасной скаляр
     * конвейера → дефолт реестра. Недоступность настроек не роняет скан:
     * остаётся прежний скаляр портала.
     */
    private async minDurationByType(
        domain: string,
        portal: PortalAiSettingsRecord | null,
    ): Promise<MinDurationSecByType> {
        const fallbackSec = portal?.minDurationSec ?? null;
        const settings = await this.appSettings
            .resolve(domain, EnumPortalAppCode.kpiSales)
            .catch((error: Error) => {
                this.logger.warn(
                    `Настройки kpiSales портала ${domain} не прочитаны (${error.message}) — порог из portal_ai_settings`,
                );
                return null;
            });

        return minDurationByTypeOfSettings(settings, fallbackSec);
    }

    private merge(
        portal: PortalAiSettingsRecord | null,
        minDurationSecByType: MinDurationSecByType,
    ): EffectiveCallReportSettings {
        return {
            minDurationSecByType,
            enabled: portal?.enabled ?? DEFAULTS.enabled,
            deepAnalysisEnabled:
                portal?.deepAnalysisEnabled ?? DEFAULTS.deepAnalysisEnabled,
            createSmartEnabled:
                portal?.createSmartEnabled ?? DEFAULTS.createSmartEnabled,
            classifyEnabled:
                portal?.classifyEnabled ?? DEFAULTS.classifyEnabled,
            salesOnly: portal?.salesOnly ?? DEFAULTS.salesOnly,
            // Скалярный порог = минимум карты: его читает скан, где тип
            // звонка ещё не известен (фильтр >=CALL_DURATION в Битриксе).
            minDurationSec: minDurationFloorSec(minDurationSecByType),
            windowHours: portal?.windowHours ?? DEFAULTS.windowHours,
            maxPerRun: portal?.maxPerRun ?? DEFAULTS.maxPerRun,
            staleMinutes: portal?.staleMinutes ?? DEFAULTS.staleMinutes,
            llmModel: portal?.llmModel ?? DEFAULTS.llmModel,
            deepAnalysisModel: portal?.deepAnalysisModel ?? null,
            scanIntervalMinutes: portal?.scanIntervalMinutes ?? null,
            nightScanIntervalMinutes: portal?.nightScanIntervalMinutes ?? null,
            nightStartHour: portal?.nightStartHour ?? null,
            nightEndHour: portal?.nightEndHour ?? null,
            lastScanAt: portal?.lastScanAt ?? null,
            allowedUserIds: portal?.allowedUserIds ?? null,
            irrelevantConfidence:
                portal?.irrelevantConfidence ?? DEFAULTS.irrelevantConfidence,
            revisorEnabled: portal?.revisorEnabled ?? DEFAULTS.revisorEnabled,
            presentationAuditEnabled:
                portal?.presentationAuditEnabled ??
                DEFAULTS.presentationAuditEnabled,
            presentationStrictness:
                portal?.presentationStrictness ??
                DEFAULTS.presentationStrictness,
            complianceReviewEnabled:
                portal?.complianceReviewEnabled ??
                DEFAULTS.complianceReviewEnabled,
            ownOrgNames: [...(portal?.ownOrgNames ?? NO_OWN_ORG_NAMES)],
            source: portal ? 'portal' : 'default',
        };
    }
}
