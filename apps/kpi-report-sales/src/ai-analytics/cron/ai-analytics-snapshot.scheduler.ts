import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueueDispatcherService } from '@/modules/queue';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { toPortalDate } from '@lib/sales-ai-analytics';
import {
    AI_PIPELINE_CRON,
    AI_PIPELINE_JOB_OPTIONS,
    AI_PIPELINE_PLANS_KEY_PREFIX,
    AI_PIPELINE_PLANS_STEPS,
    AiPipelinePeriodKeys,
    AiPipelineRhythm,
    buildPipelineJobId,
    resolvePipelineKeys,
} from '../constants/ai-snapshot.const';
import { AiAnalyticsPortalsLoader } from '../domain/loaders/portals.loader';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { isoWeekKey } from '../domain/loaders/period.util';
import { AiSnapshotJobData } from '../dto/ai-snapshot.dto';
import { AiAnalyticsBackfillService } from '../pipeline/backfill.service';

/**
 * Тик планировщика: три ритма пересчёта плюс снимок планов 1-го числа.
 * Снимок планов идёт ритмом `monthly` (новых видов джоб не заводим), но в
 * собственном пространстве ключей и только со своим шагом.
 */
export type AiPipelineTick = 'nightly' | 'weekly' | 'monthly' | 'plans';

/** Что ставим в очередь по тику: ритм, ключ дедупликации и payload. */
interface TickPlan {
    rhythm: AiPipelineRhythm;
    key: string;
    keys: AiPipelinePeriodKeys;
    steps?: readonly string[];
}

/**
 * Планировщик ночного конвейера снапшотов (план §5.3, поток 12):
 * ежедневно 03:45 МСК, по понедельникам 03:15 МСК (закончившаяся неделя),
 * 3-го числа 04:00 МСК (заморозка закрытого месяца) и 1-го числа 04:00 МСК
 * (снимок планов руководителя). По каждому порталу с ai_analytics_enabled
 * ставится ОДНА джоба SALES_AI_ANALYTICS_SNAPSHOT в очередь
 * SALES_KPI_REPORT; сам расчёт — в процессоре (SnapshotPipelineService),
 * чтобы тяжёлые выборки не жили в cron-тике.
 *
 * jobId детерминирован (`ai-analytics:snapshot:{rhythm}:{domain}:{key}`) —
 * повторный тик за ту же дату джобу не дублирует. Ошибка одного портала
 * логируется с телеграмом и не прерывает обход остальных.
 */
@Injectable()
export class AiAnalyticsSnapshotScheduler {
    private readonly logger = new Logger(AiAnalyticsSnapshotScheduler.name);

    constructor(
        private readonly portals: AiAnalyticsPortalsLoader,
        private readonly settings: SettingsLoader,
        private readonly dispatcher: QueueDispatcherService,
        private readonly backfill: AiAnalyticsBackfillService,
    ) {}

    @Cron(AI_PIPELINE_CRON.NIGHTLY)
    async nightly(): Promise<void> {
        await this.dispatchAll('nightly');
    }

    @Cron(AI_PIPELINE_CRON.WEEKLY)
    async weekly(): Promise<void> {
        await this.dispatchAll('weekly');
    }

    @Cron(AI_PIPELINE_CRON.MONTHLY)
    async monthly(): Promise<void> {
        await this.dispatchAll('monthly');
    }

    @Cron(AI_PIPELINE_CRON.PLANS)
    async plans(): Promise<void> {
        await this.dispatchAll('plans');
    }

    /** Ставит джобы по всем подходящим порталам; возвращает jobId'ы. */
    async dispatchAll(
        tick: AiPipelineTick,
        now: Date = new Date(),
    ): Promise<string[]> {
        const domains = await this.portals.listDomains();
        const jobIds: string[] = [];
        for (const domain of domains) {
            const jobId = await this.dispatchDomain(domain, tick, now);
            if (!jobId) continue;
            jobIds.push(jobId);
            if (tick === 'nightly') {
                jobIds.push(...(await this.dispatchBackfill(domain, now)));
            }
        }
        if (jobIds.length) {
            this.logger.log(
                `Конвейер (${tick}): поставлено джоб ${jobIds.length} из ${domains.length} порталов`,
            );
        }
        return jobIds;
    }

    /** Один портал: флаг → ключи периода в TZ портала → dispatch. */
    private async dispatchDomain(
        domain: string,
        tick: AiPipelineTick,
        now: Date,
    ): Promise<string | null> {
        try {
            const settings = await this.settings.load(domain);
            if (!settings.enabled) return null;
            const day = toPortalDate(now, settings.calendar.timeZone);
            const plan = buildTickPlan(tick, day);
            const jobId = buildPipelineJobId(plan.rhythm, domain, plan.key);
            await this.dispatcher.dispatch<AiSnapshotJobData>(
                QueueNames.SALES_KPI_REPORT,
                JobNames.SALES_AI_ANALYTICS_SNAPSHOT,
                {
                    domain,
                    kind: plan.rhythm,
                    ...plan.keys,
                    ...(plan.steps ? { steps: [...plan.steps] } : {}),
                } satisfies AiSnapshotJobData,
                jobId,
                AI_PIPELINE_JOB_OPTIONS,
            );
            return jobId;
        } catch (error) {
            this.logger.error(
                `Конвейер (${tick}) ${domain}: джоба не поставлена: ${(error as Error).message}`,
                { telegram: true, domain },
            );
            return null;
        }
    }

    /**
     * Догон истории (§1.1: в Фазе 2 backfill запускает только ночной
     * конвейер): сервис сам проверит ночное окно 22:00–06:00 по TZ портала
     * и вернёт пустой список вне окна. Отказ догона ночной пересчёт не
     * отменяет — сообщение уходит в телеграм, обход продолжается.
     */
    private async dispatchBackfill(
        domain: string,
        now: Date,
    ): Promise<string[]> {
        try {
            return await this.backfill.dispatch(domain, { now });
        } catch (error) {
            this.logger.error(
                `Догон истории ${domain} не поставлен: ${(error as Error).message}`,
                { telegram: true, domain },
            );
            return [];
        }
    }
}

/**
 * Ключи периода и ключ дедупликации по тику. Ночной ритм дедуплицируется
 * днём, недельный — закончившейся неделей, месячный — закрытым месяцем,
 * снимок планов — текущим месяцем с префиксом (иначе через месяц его
 * jobId столкнулся бы с заморозкой того же месяца).
 */
function buildTickPlan(tick: AiPipelineTick, day: string): TickPlan {
    if (tick === 'plans') {
        const monthKey = day.slice(0, 7);
        return {
            rhythm: 'monthly',
            key: `${AI_PIPELINE_PLANS_KEY_PREFIX}${monthKey}`,
            keys: { day, weekKey: isoWeekKey(day), monthKey },
            steps: AI_PIPELINE_PLANS_STEPS,
        };
    }
    const keys = resolvePipelineKeys(tick, day);
    const key =
        tick === 'weekly'
            ? keys.weekKey
            : tick === 'monthly'
              ? keys.monthKey
              : keys.day;
    return { rhythm: tick, key, keys };
}
