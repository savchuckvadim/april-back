/**
 * Ежедневный крон ретенции снапшотов AI-аналитики (план Фазы 3, П5) по
 * ЛОКАЛЬНОМУ часу портала (П10): тик — ежечасный на минуте слота, «пора
 * ли» решает `dueLocalClock` библиотеки по поясу из настройки
 * `ai_analytics_calendar` портала (без пояса — Europe/Moscow). Портал
 * обходится ровно один раз в сутки: слот попадает в один тик.
 *
 * Режим по умолчанию — расчёт без удаления (`dryRun`): крон копит сводки
 * в логах, а первое реальное удаление делается руками через ручку
 * `POST admin/ai-analytics/retention/run` с предупреждением в чат
 * админов (решение владельца В8 от 22.09.2026).
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    dueLocalClock,
    hourlyTickCron,
    type AiLocalSlot,
} from '../model/local-clock';
import { parseWorkCalendar } from '../model/workdays.util';
import { AiAnalyticsRetentionService } from './services/ai-analytics-retention.service';

/** Слот ретенции: ежедневно 04:30 по часам портала — после ночных конвейеров. */
export const AI_ANALYTICS_RETENTION_LOCAL_HOUR: AiLocalSlot = {
    hour: 4,
    minute: 30,
};

/** Тик крона — на :30 каждого часа; локальный час проверяет планировщик. */
export const AI_ANALYTICS_RETENTION_CRON = hourlyTickCron(
    AI_ANALYTICS_RETENTION_LOCAL_HOUR,
);

/** Ключ настройки с календарём портала (JSON с полем timeZone). */
export const AI_ANALYTICS_CALENDAR_SETTING_KEY = 'ai_analytics_calendar';

/** Крон считает, но не удаляет: удаление — только ручкой. */
export const AI_ANALYTICS_RETENTION_CRON_DRY_RUN = true;

/** Портал ростера: домен и пояс из его настроек. */
export interface RetentionPortal {
    domain: string;
    timeZone: string | null;
}

@Injectable()
export class AiAnalyticsRetentionScheduler {
    private readonly logger = new Logger(AiAnalyticsRetentionScheduler.name);

    constructor(
        private readonly appSettings: PortalAppSettingsService,
        private readonly retention: AiAnalyticsRetentionService,
    ) {}

    @Cron(AI_ANALYTICS_RETENTION_CRON)
    async tick(): Promise<void> {
        await this.runDue();
    }

    /** Порталы, у которых слот наступил в последний час по их поясу. */
    async runDue(now: Date = new Date()): Promise<string[]> {
        const portals = (await this.listPortals()).filter(
            portal =>
                dueLocalClock(
                    now,
                    portal.timeZone,
                    AI_ANALYTICS_RETENTION_LOCAL_HOUR,
                ) !== null,
        );

        return this.runPortals(portals, now);
    }

    /** Обход всех порталов без проверки часа (ручной запуск, спеки). */
    async runAll(now: Date = new Date()): Promise<string[]> {
        return this.runPortals(await this.listPortals(), now);
    }

    /** Отказ одного портала не прерывает остальные. Возвращает сводки. */
    private async runPortals(
        portals: readonly RetentionPortal[],
        now: Date,
    ): Promise<string[]> {
        const summaries: string[] = [];
        for (const portal of portals) {
            try {
                const result = await this.retention.run({
                    domain: portal.domain,
                    dryRun: AI_ANALYTICS_RETENTION_CRON_DRY_RUN,
                    now,
                });
                summaries.push(result.summary);
            } catch (error) {
                this.logger.error(
                    `Ретенция ${portal.domain} не посчитана: ${(error as Error).message}`,
                    { telegram: true, domain: portal.domain },
                );
            }
        }
        return summaries;
    }

    /**
     * Порталы со строкой настроек kpiSales и их пояса; дубль домена
     * схлопывается (побеждает первая строка). Ошибка чтения — пустой список.
     */
    private async listPortals(): Promise<RetentionPortal[]> {
        try {
            const rows = await this.appSettings.listByAppCode(
                EnumPortalAppCode.kpiSales,
            );
            const byDomain = new Map<string, RetentionPortal>();
            for (const row of rows) {
                if (byDomain.has(row.domain)) continue;
                byDomain.set(row.domain, {
                    domain: row.domain,
                    timeZone: timeZoneOf(
                        row.settings[AI_ANALYTICS_CALENDAR_SETTING_KEY],
                    ),
                });
            }
            return [...byDomain.values()];
        } catch (error) {
            this.logger.error(
                `Порталы для ретенции не прочитаны: ${(error as Error).message}`,
                { telegram: true },
            );
            return [];
        }
    }
}

/** Пояс из JSON календаря настройки; не строка или битый JSON — null. */
export function timeZoneOf(value: unknown): string | null {
    if (typeof value !== 'string' || value.trim() === '') return null;
    try {
        return parseWorkCalendar(value).timeZone || null;
    } catch {
        return null;
    }
}
