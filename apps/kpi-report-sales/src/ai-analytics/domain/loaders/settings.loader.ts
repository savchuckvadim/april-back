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
}

/**
 * Загрузчик настроек: PortalAppSettingsService.resolve(domain, kpiSales)
 * → флаги, РОПы (parseUserIds) и календарь рабочих дней (parseWorkCalendar:
 * пустой/битый JSON → дефолт Europe/Moscow, пн–пт).
 */
@Injectable()
export class SettingsLoader {
    constructor(private readonly appSettings: PortalAppSettingsService) {}

    async load(domain: string): Promise<AiAnalyticsPortalSettings> {
        const settings = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.kpiSales,
        );
        return {
            enabled: settings.aiAnalyticsEnabled,
            auditEnabled: settings.aiAnalyticsAuditEnabled,
            alertsEnabled: settings.aiAnalyticsAlertsEnabled,
            digestEnabled: settings.aiAnalyticsDigestEnabled,
            ropUserIds: parseUserIds(settings.aiAnalyticsRopUserIds),
            calendar: parseWorkCalendar(settings.aiAnalyticsCalendar),
        };
    }
}
