import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { toPortalDate } from '@lib/sales-ai-analytics';
import { defaultOverviewPeriod } from '../cache/cache-key.util';
import {
    AI_ANALYTICS_PREWARM_CRON,
    AI_ANALYTICS_PREWARM_JOB_OPTIONS,
} from '../constants/ai-overview.const';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { OverviewLookupUseCase } from '../domain/use-cases/overview-lookup.use-case';

/**
 * Прогрев обзора (план 5.3, Фаза 1b): ежедневно 05:30 МСК — после ночных
 * KPI-пересчётов (своего события ночного отчёта в kpi-report-sales нет,
 * поэтому крон по времени) — по каждому порталу с ai_analytics_enabled
 * ставит джобу SALES_AI_ANALYTICS_OVERVIEW за период по умолчанию:
 * скользящие 4 недели до вчерашнего дня в TZ портала, весь ростер ОП.
 * jobId = requestKey (тот же ключ, что построит фронт без фильтров) —
 * повторный тик и пользовательский запрос джобу не дублируют.
 * forceRefresh: ночной прогрев обязан перезаписать вчерашний хвост
 * (write-through), а не отдать старую запись. Приоритет ниже
 * пользовательских джоб.
 */
@Injectable()
export class AiAnalyticsOverviewPrewarmScheduler {
    private readonly logger = new Logger(
        AiAnalyticsOverviewPrewarmScheduler.name,
    );

    constructor(
        private readonly portals: AiAnalyticsPortalsLoader,
        private readonly settings: SettingsLoader,
        private readonly overview: OverviewLookupUseCase,
    ) {}

    @Cron(AI_ANALYTICS_PREWARM_CRON)
    async tick(): Promise<void> {
        await this.dispatchAll();
    }

    /** Ставит джобы по всем подходящим порталам; возвращает jobId'ы. */
    async dispatchAll(now = new Date()): Promise<string[]> {
        const domains = await this.portals.listDomains();
        const jobIds: string[] = [];
        for (const domain of domains) {
            const jobId = await this.dispatchDomain(domain, now);
            if (jobId) jobIds.push(jobId);
        }
        if (jobIds.length) {
            this.logger.log(
                `Прогрев обзора: поставлено джоб ${jobIds.length} из ${domains.length} порталов`,
            );
        }
        return jobIds;
    }

    /** Один портал: флаг → период по умолчанию в TZ портала → dispatch. Ошибка не прерывает обход. */
    private async dispatchDomain(
        domain: string,
        now: Date,
    ): Promise<string | null> {
        try {
            const settings = await this.settings.load(domain);
            if (!settings.enabled) return null;
            const { from, to } = defaultOverviewPeriod(
                toPortalDate(now, settings.calendar.timeZone),
            );
            const { requestKey, managerIds } = await this.overview.resolveKey({
                domain,
                from,
                to,
            });
            return await this.overview.dispatch(
                {
                    domain,
                    from,
                    to,
                    managerIds,
                    confirmedOnly: false,
                    forceRefresh: true,
                    requestKey,
                },
                AI_ANALYTICS_PREWARM_JOB_OPTIONS,
            );
        } catch (error) {
            this.logger.error(
                `Прогрев обзора ${domain}: джоба не поставлена: ${(error as Error).message}`,
                { telegram: true, domain },
            );
            return null;
        }
    }
}
