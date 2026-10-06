import { Injectable } from '@nestjs/common';
import {
    EnumPortalAppCode,
    parseUserIds,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    DealAuditFrequency,
    parseDealAuditFrequency,
} from '../lib/deal-audit-schedule';
import { DealAuditOptions } from './deal-audit.service';

/** Нижняя граница порогов: ноль сделал бы забытыми все сделки портала. */
const MIN_DAYS = 1;

/**
 * Потолок сделок на отдел за прогон: решение владельца (05.10.2026) и
 * одновременно размер страницы Битрикса — больше одним запросом не взять.
 */
const MAX_PER_DEPARTMENT = 50;

const positive = (raw: unknown, fallback: number): number => {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

/**
 * Настройки аудита портала → параметры прогона.
 *
 * Отдельный сервис, потому что читателей двое (крон и ручка), и правила
 * «что считать пустым, что дефолтом» должны быть одни на обоих: иначе
 * ручной прогон легко расходится с ночным по порогам, и разбор «почему у
 * крона 40 забытых, а у меня 12» упирается в две разные ветки кода.
 */
@Injectable()
export class DealAuditSettingsService {
    constructor(private readonly appSettings: PortalAppSettingsService) {}

    /** Включён ли аудит на портале. */
    async isEnabled(domain: string): Promise<boolean> {
        const settings = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.eventSales,
        );
        return Boolean(settings.dealAuditEnabled);
    }

    /**
     * Параметры прогона. `overrides` приходят из ручки и перебивают
     * настройки портала — крон их не передаёт никогда.
     */
    async resolveOptions(
        domain: string,
        overrides: Partial<
            Pick<DealAuditOptions, 'dryRun' | 'maxPerRun' | 'dealIds'>
        > = {},
    ): Promise<DealAuditOptions & { frequency: DealAuditFrequency }> {
        const settings = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.eventSales,
        );
        return {
            idleDays: Math.max(
                MIN_DAYS,
                positive(settings.dealAuditIdleDays, 14),
            ),
            overdueHours: positive(settings.dealAuditOverdueHours, 24),
            stageStuckDays: Math.max(
                MIN_DAYS,
                positive(settings.dealAuditStageStuckDays, 30),
            ),
            forgotCloseDays: Math.max(
                MIN_DAYS,
                positive(settings.dealAuditForgotCloseDays, 21),
            ),
            dryRun: overrides.dryRun ?? Boolean(settings.dealAuditDryRun),
            maxPerRun:
                overrides.maxPerRun ??
                positive(settings.dealAuditMaxPerRun, 500),
            dealIds: overrides.dealIds,
            digest: {
                toManager: Boolean(settings.dealAuditDigestToManager),
                toHead: Boolean(settings.dealAuditDigestToHead),
                userIds: parseUserIds(
                    String(settings.dealAuditDigestUserIds ?? ''),
                ),
                departmentUserIds: parseUserIds(
                    String(settings.dealAuditDigestDepartmentUserIds ?? ''),
                ),
                excludeUserIds: parseUserIds(
                    String(settings.dealAuditDigestExcludeUserIds ?? ''),
                ),
                limit: positive(settings.dealAuditDigestLimit, 20),
            },
            maxPerDepartment: Math.min(
                MAX_PER_DEPARTMENT,
                Math.floor(
                    positive(
                        settings.dealAuditMaxPerDepartment,
                        MAX_PER_DEPARTMENT,
                    ),
                ),
            ),
            frequency: parseDealAuditFrequency(settings.dealAuditFrequency),
        };
    }
}
