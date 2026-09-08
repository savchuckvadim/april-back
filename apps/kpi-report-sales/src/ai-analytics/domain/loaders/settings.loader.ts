import { Injectable } from '@nestjs/common';
import {
    EnumPortalAppCode,
    parseUserIds,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { parseWorkCalendar, WorkCalendar } from '@lib/sales-ai-analytics';
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
}

/**
 * Загрузчик настроек: PortalAppSettingsService.resolve(domain, kpiSales)
 * → флаги, списки id (parseUserIds), календарь рабочих дней
 * (parseWorkCalendar) и десять блоков Фазы 2 (парсеры lib: пустой или
 * битый JSON → дефолт кода). Одно чтение настроек на запрос — сервис
 * кэширует их в Redis сам.
 */
@Injectable()
export class SettingsLoader {
    constructor(private readonly appSettings: PortalAppSettingsService) {}

    async load(domain: string): Promise<AiAnalyticsPortalSettings> {
        const settings = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.kpiSales,
        );
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
        };
    }
}
