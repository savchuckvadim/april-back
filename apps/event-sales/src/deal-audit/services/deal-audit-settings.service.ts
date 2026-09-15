import { Injectable } from '@nestjs/common';
import {
    EnumPortalAppCode,
    parseUserIds,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { DealAuditOptions } from './deal-audit.service';

/** Нижняя граница порогов: ноль сделал бы забытыми все сделки портала. */
const MIN_DAYS = 1;

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
    ): Promise<DealAuditOptions & { intervalMinutes: number }> {
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
                limit: positive(settings.dealAuditDigestLimit, 20),
            },
            intervalMinutes: positive(settings.dealAuditIntervalMinutes, 1440),
        };
    }
}
