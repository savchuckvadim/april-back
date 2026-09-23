import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { defaultOverviewPeriod } from '../cache/cache-key.util';
import {
    AI_ANALYTICS_LOCAL_HOURS,
    AI_ANALYTICS_PREWARM_CRON,
} from '../constants/ai-cron.const';
import { AI_ANALYTICS_PREWARM_JOB_OPTIONS } from '../constants/ai-overview.const';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { OverviewLookupUseCase } from '../domain/use-cases/overview-lookup.use-case';
import { dueLocalClock } from './local-hour.util';

/**
 * Прогрев обзора (план 5.3, Фаза 1b): ежедневно 05:30 по ЛОКАЛЬНОМУ
 * времени портала (Фаза 3, П10) — после ночных KPI-пересчётов (своего
 * события ночного отчёта в kpi-report-sales нет, поэтому крон по времени).
 * Тик ежечасный на :30; по каждому порталу с ai_analytics_enabled, у
 * которого наступили его 05:30 (cron/local-hour.util.ts), ставится джоба
 * SALES_AI_ANALYTICS_OVERVIEW за период по умолчанию: скользящие 4 недели
 * до вчерашнего дня в TZ портала, весь ростер ОП.
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

    /** Ставит джобы порталам, у которых наступил локальный час прогрева; возвращает jobId'ы. */
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

    /** Один портал: локальный час → флаг → период по умолчанию по дню портала → dispatch. Ошибка не прерывает обход. */
    private async dispatchDomain(
        domain: string,
        now: Date,
    ): Promise<string | null> {
        try {
            const settings = await this.settings.load(domain);
            const timeZone = settings.calendar.timeZone;
            const clock = dueLocalClock(
                now,
                timeZone,
                AI_ANALYTICS_LOCAL_HOURS.PREWARM,
            );
            if (!clock || !settings.enabled) return null;
            const { from, to } = defaultOverviewPeriod(clock.date);
            const { requestKey, managerIds } = await this.overview.resolveKey({
                domain,
                from,
                to,
            });
            const jobId = await this.overview.dispatch(
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
            this.logger.log(
                `Прогрев обзора ${domain}: локально ${clock.time} ${timeZone} → ${jobId}`,
            );
            return jobId;
        } catch (error) {
            this.logger.error(
                `Прогрев обзора ${domain}: джоба не поставлена: ${(error as Error).message}`,
                { telegram: true, domain },
            );
            return null;
        }
    }
}
