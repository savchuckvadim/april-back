import { Injectable } from '@nestjs/common';
import {
    EnumPortalAppCode,
    parseUserIds,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { parseWorkCalendar, WorkCalendar } from '@lib/sales-ai-analytics';

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
}

/**
 * Загрузчик настроек: PortalAppSettingsService.resolve(domain, kpiSales)
 * → флаги, списки id (parseUserIds) и календарь рабочих дней
 * (parseWorkCalendar: пустой/битый JSON → дефолт Europe/Moscow, пн–пт).
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
        };
    }
}
