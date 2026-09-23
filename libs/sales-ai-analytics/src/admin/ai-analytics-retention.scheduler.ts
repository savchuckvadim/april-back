/**
 * Ежедневный крон ретенции снапшотов AI-аналитики (план Фазы 3, П5).
 *
 * ⚠ Время — UTC, не локальный час портала. Слот локального времени (П10)
 * считает `dueLocalClock` из `apps/kpi-report-sales/src/ai-analytics/cron/
 * local-hour.util.ts`, а библиотека приложение импортировать не может
 * (луковая архитектура). Дублировать разбор поясов ради служебной
 * чистки — лишняя сущность: ретенция не привязана к рабочему дню портала
 * и одинаково хорошо идёт ночью по UTC. Если понадобится локальный час,
 * утилиту надо поднять в библиотеку (она уже импортирует отсюда
 * `DEFAULT_WORK_CALENDAR`) — это отдельная правка в периметре П10.
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
import { AiAnalyticsRetentionService } from './services/ai-analytics-retention.service';

/** Ежедневно в 04:30 UTC — после ночных конвейеров любого из поясов. */
export const AI_ANALYTICS_RETENTION_CRON = '30 4 * * *';

/** Крон считает, но не удаляет: удаление — только ручкой. */
export const AI_ANALYTICS_RETENTION_CRON_DRY_RUN = true;

@Injectable()
export class AiAnalyticsRetentionScheduler {
    private readonly logger = new Logger(AiAnalyticsRetentionScheduler.name);

    constructor(
        private readonly appSettings: PortalAppSettingsService,
        private readonly retention: AiAnalyticsRetentionService,
    ) {}

    @Cron(AI_ANALYTICS_RETENTION_CRON)
    async daily(): Promise<void> {
        await this.runAll();
    }

    /** Обход порталов: отказ одного не прерывает остальные. Возвращает сводки. */
    async runAll(now: Date = new Date()): Promise<string[]> {
        const domains = await this.listDomains();
        const summaries: string[] = [];
        for (const domain of domains) {
            try {
                const result = await this.retention.run({
                    domain,
                    dryRun: AI_ANALYTICS_RETENTION_CRON_DRY_RUN,
                    now,
                });
                summaries.push(result.summary);
            } catch (error) {
                this.logger.error(
                    `Ретенция ${domain} не посчитана: ${(error as Error).message}`,
                    { telegram: true, domain },
                );
            }
        }
        return summaries;
    }

    /** Домены со строкой настроек kpiSales; ошибка чтения — пустой список. */
    private async listDomains(): Promise<string[]> {
        try {
            const rows = await this.appSettings.listByAppCode(
                EnumPortalAppCode.kpiSales,
            );
            return [...new Set(rows.map(row => row.domain))];
        } catch (error) {
            this.logger.error(
                `Порталы для ретенции не прочитаны: ${(error as Error).message}`,
                { telegram: true },
            );
            return [];
        }
    }
}
