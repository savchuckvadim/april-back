import { Injectable, Optional } from '@nestjs/common';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import type { PortalAiSettingsRecord } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.types';
import {
    EnumPortalAppCode,
    parseUserIds,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    isMinDurationPortalDefined,
    parseWorkCalendar,
    WorkCalendar,
} from '@lib/sales-ai-analytics';
import {
    parseAiAbsences,
    parseAiDefinitions,
    parseAiEvents,
    parseAiHypothesis,
    parseAiLevels,
    parseAiManagerParams,
    parseAiModelParams,
    parseAiScoring,
    parseAiTargets,
    parseRosterConfirmedAt,
} from '@lib/sales-ai-analytics/settings/ai-settings.parse';
import type {
    AiAbsencesByManager,
    AiManagerLevelSetting,
    AiManagerParamsByManager,
    AiModelParams,
    AiPortalDefinitions,
    AiPortalEvent,
    AiQualityHypothesis,
    AiScoringSettings,
    AiTargets,
} from '@lib/sales-ai-analytics/settings/ai-settings.types';

/**
 * Конвейер разбора звонков обрабатывает портал только при явном включении
 * в админке (дефолт `enabled` резолвера call-report в event-sales).
 */
const CALL_REPORT_ENABLED_DEFAULT = false;

/**
 * Конвейер разбора звонков портала (portal_ai_settings) глазами витрины:
 * витрина объясняет «пилот на одном сотруднике», а не «поломка».
 */
export interface AiCallReportStatus {
    /** Портал обрабатывается конвейером (null в записи → дефолт false). */
    enabled: boolean;
    /** Демо/пилот: разбираются только эти сотрудники; null — весь ОП. */
    pilotUserIds: number[] | null;
    /** Только отдел продаж; null — не задано (дефолт конвейера — да). */
    salesOnly: boolean | null;
    /** Прежний скаляр порога длительности, с; null — не задан. */
    minDurationSec: number | null;
}

/**
 * Запись portal_ai_settings → статус конвейера. Записи нет — портал не
 * включали (enabled = false); пустой список пилота — ограничения нет
 * (конвейер фильтрует только по непустому списку).
 */
export function toCallReportStatus(
    record: PortalAiSettingsRecord | null,
): AiCallReportStatus {
    const pilot = record?.allowedUserIds ?? [];
    return {
        enabled: record?.enabled ?? CALL_REPORT_ENABLED_DEFAULT,
        pilotUserIds: pilot.length > 0 ? [...pilot] : null,
        salesOnly: record?.salesOnly ?? null,
        minDurationSec: record?.minDurationSec ?? null,
    };
}

/** Настройки AI-аналитики портала (kpiSales, контракт 1) в разобранном виде. */
export interface AiAnalyticsPortalSettings {
    enabled: boolean;
    /** Аудит и калибровка данных по порталу разрешены (ai_analytics_audit_enabled). */
    auditEnabled: boolean;
    alertsEnabled: boolean;
    digestEnabled: boolean;
    ropUserIds: number[];
    calendar: WorkCalendar;
    /**
     * Менеджер без роли руководителя видит витрину по себе
     * (ai_analytics_self_view_enabled); false — читающие ручки отвечают 403.
     */
    selfViewEnabled: boolean;
    /** План дня в дайджесте менеджера и ручка plan/daily (ai_analytics_daily_plan_enabled). */
    dailyPlanEnabled: boolean;
    /** Адресаты сводного дайджеста по всем менеджерам (ai_analytics_digest_all_user_ids). */
    digestAllUserIds: number[];
    /** Согласие портала на обезличенный пул (ai_analytics_pool_opt_in). */
    poolOptIn: boolean;
    /** Дата согласия на пул (ISO); null — не задана. */
    poolConsentAt: string | null;
    /** Эксперименты на портале (ai_analytics_experiments_enabled). */
    experimentsEnabled: boolean;
    // --- Фаза 2, §3.3: решения людей JSON-строками. Битый JSON любого
    // ключа даёт дефолт кода, а не исключение, — витрина не гаснет.
    /** Уровни менеджеров (ai_analytics_levels); пусто — читается снапшот. */
    levels: AiManagerLevelSetting[];
    /** Цели по уровням и личные переопределения (ai_analytics_targets). */
    targets: AiTargets;
    /** Отсутствия менеджеров (ai_analytics_absences). */
    absences: AiAbsencesByManager;
    /** Гиперпараметры реестра, решённые порталом (ai_analytics_model_params). */
    modelParams: AiModelParams;
    /** Слои менеджеров (ai_analytics_manager_params). */
    managerParams: AiManagerParamsByManager;
    /** Определения событий портала (ai_analytics_definitions). */
    definitions: AiPortalDefinitions;
    /** Журнал событий портала (ai_analytics_events). */
    events: AiPortalEvent[];
    /** Потолки оценивания и стоп-фразы (ai_analytics_scoring). */
    scoring: AiScoringSettings;
    /** Гипотеза «качество → объём» (ai_analytics_hypothesis); null — не задана. */
    hypothesis: AiQualityHypothesis | null;
    /** Дата подтверждения ростера (ai_analytics_roster_confirmed_at); '' — нет. */
    rosterConfirmedAt: string;
    /**
     * Портал задал порог длительности ПО ТИПАМ явно (ключ
     * `minDurationSecByType` в ai_analytics_definitions или код
     * `min_duration_sec_by_type` в ai_analytics_model_params). По разобранным
     * блокам этого не определить: парсер подставляет дефолт реестра вместо
     * отсутствующего ключа, и «портал задал 300» неотличимо от «не задавал».
     * Признак читает `portalMinDurationByType` (решение владельца А.1).
     * undefined — признак не считался (ручные фикстуры): слой портала
     * читается как есть.
     */
    minDurationDefined?: boolean;
    /**
     * Прежний скаляр конвейера разбора — `portal_ai_settings.min_duration_sec`
     * старой админки. Запасной источник порога после явного решения в
     * настройках AI-аналитики: без него портал, где пилот 60 с задан только
     * в старой админке, считался бы пульсом и ночным расчётом по 300, а
     * разбором — по 60. null — не задан; undefined — сервис не подключён
     * (ручные фикстуры).
     */
    legacyMinDurationSec?: number | null;
    /**
     * Конвейер разбора звонков из той же записи portal_ai_settings;
     * undefined — сервис не подключён либо запись не прочитана (статус
     * неизвестен — витрина не должна выдавать его за «выключено»).
     */
    callReport?: AiCallReportStatus;
}

/**
 * Загрузчик настроек: PortalAppSettingsService.resolve(domain, kpiSales)
 * → флаги, списки id (parseUserIds), календарь рабочих дней
 * (parseWorkCalendar) и десять блоков Фазы 2 (парсеры lib: пустой или
 * битый JSON → дефолт кода). Параллельно — одна запись portal_ai_settings
 * старой админки разбора: запасной порог длительности и статус конвейера
 * (включён, пилот, только ОП). Одно чтение настроек на запрос — сервис
 * кэширует их в Redis сам.
 */
@Injectable()
export class SettingsLoader {
    constructor(
        private readonly appSettings: PortalAppSettingsService,
        /** Старая админка разбора; без неё запасного скаляра просто нет. */
        @Optional()
        private readonly portalAiSettings?: PortalAiSettingsService,
    ) {}

    /**
     * Запись старой админки разбора (порог и статус конвейера): null —
     * записи нет; undefined — сервис не подключён либо чтение упало
     * (fail-open: настройки витрины не гаснут).
     */
    private async callReportRecord(
        domain: string,
    ): Promise<PortalAiSettingsRecord | null | undefined> {
        if (!this.portalAiSettings) return undefined;
        try {
            return await this.portalAiSettings.getByDomain(domain);
        } catch {
            return undefined;
        }
    }

    async load(domain: string): Promise<AiAnalyticsPortalSettings> {
        const [settings, record] = await Promise.all([
            this.appSettings.resolve(domain, EnumPortalAppCode.kpiSales),
            this.callReportRecord(domain),
        ]);
        const poolConsentAt = settings.aiAnalyticsPoolConsentAt.trim();
        return {
            enabled: settings.aiAnalyticsEnabled,
            auditEnabled: settings.aiAnalyticsAuditEnabled,
            alertsEnabled: settings.aiAnalyticsAlertsEnabled,
            digestEnabled: settings.aiAnalyticsDigestEnabled,
            ropUserIds: parseUserIds(settings.aiAnalyticsRopUserIds),
            calendar: parseWorkCalendar(settings.aiAnalyticsCalendar),
            selfViewEnabled: settings.aiAnalyticsSelfViewEnabled,
            dailyPlanEnabled: settings.aiAnalyticsDailyPlanEnabled,
            digestAllUserIds: parseUserIds(
                settings.aiAnalyticsDigestAllUserIds,
            ),
            poolOptIn: settings.aiAnalyticsPoolOptIn,
            poolConsentAt: poolConsentAt || null,
            experimentsEnabled: settings.aiAnalyticsExperimentsEnabled,
            levels: parseAiLevels(settings.aiAnalyticsLevels),
            targets: parseAiTargets(settings.aiAnalyticsTargets),
            absences: parseAiAbsences(settings.aiAnalyticsAbsences),
            modelParams: parseAiModelParams(settings.aiAnalyticsModelParams),
            managerParams: parseAiManagerParams(
                settings.aiAnalyticsManagerParams,
            ),
            definitions: parseAiDefinitions(settings.aiAnalyticsDefinitions),
            events: parseAiEvents(settings.aiAnalyticsEvents),
            scoring: parseAiScoring(settings.aiAnalyticsScoring),
            hypothesis: parseAiHypothesis(settings.aiAnalyticsHypothesis),
            rosterConfirmedAt: parseRosterConfirmedAt(
                settings.aiAnalyticsRosterConfirmedAt,
            ),
            // По сырым строкам: после парсера дефолт неотличим от решения.
            minDurationDefined: isMinDurationPortalDefined({
                aiAnalyticsDefinitions: settings.aiAnalyticsDefinitions,
                aiAnalyticsModelParams: settings.aiAnalyticsModelParams,
            }),
            legacyMinDurationSec: record?.minDurationSec ?? null,
            ...(record === undefined
                ? {}
                : { callReport: toCallReportStatus(record) }),
        };
    }
}
