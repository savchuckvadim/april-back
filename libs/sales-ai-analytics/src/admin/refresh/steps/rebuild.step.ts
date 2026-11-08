import { Injectable } from '@nestjs/common';
import { AiAnalyticsEtlStatusService } from '../../services/ai-analytics-etl-status.service';
import { AiAnalyticsPipelineAdminService } from '../../services/ai-analytics-pipeline-admin.service';
import type { AiRefreshStepOutcome } from '../refresh.types';
import {
    errorOutcome,
    sincePhaseStart,
    type AiRefreshStepContext,
    type AiRefreshStepHandler,
} from './refresh-step.types';

/** Ритм догона в журнале прогонов. */
const BACKFILL_RHYTHM = 'backfill';
/** Окно чтения журнала: шаг не идёт дольше суток. */
const JOURNAL_DAYS = 2;

/**
 * Пересчёт месяца заново (догон с force) — как «Пересобрать витрину»:
 * звонки, история стадий, журнал прогноза задним числом и проверка
 * точности. Готовность — свежая запись журнала прогонов `backfill` за
 * этот месяц (журнал пишется только в конце прогона).
 */
@Injectable()
export class AiRefreshRebuildStep implements AiRefreshStepHandler {
    readonly code = 'rebuild' as const;

    constructor(
        private readonly pipeline: AiAnalyticsPipelineAdminService,
        private readonly etl: AiAnalyticsEtlStatusService,
    ) {}

    async start({
        scenario,
        now,
    }: AiRefreshStepContext): Promise<AiRefreshStepOutcome> {
        try {
            const result = await this.pipeline.backfill(
                {
                    domain: scenario.domain,
                    from: scenario.monthKey,
                    to: scenario.monthKey,
                    force: true,
                },
                now,
            );
            return result.jobs.length > 0
                ? {
                      state: 'running',
                      text: 'Пересчёт месяца поставлен в очередь (обычно 10–30 минут, если портал не занят другим пересчётом).',
                  }
                : {
                      state: 'error',
                      text: `Пересчёт месяца не поставлен: ${result.reason ?? 'причина не указана'}`,
                  };
        } catch (error) {
            return errorOutcome('Пересчёт месяца не поставлен', error);
        }
    }

    async probe({
        scenario,
        step,
        now,
    }: AiRefreshStepContext): Promise<AiRefreshStepOutcome> {
        try {
            const { runs } = await this.etl.status(
                scenario.domain,
                JOURNAL_DAYS,
                now,
            );
            const run = runs.find(
                item =>
                    item.rhythm === BACKFILL_RHYTHM &&
                    item.day.startsWith(scenario.monthKey) &&
                    sincePhaseStart(step, item.generatedAt),
            );
            if (!run) {
                return { state: 'running', text: 'Пересчёт месяца идёт…' };
            }
            if (run.status === 'failed') {
                return {
                    state: 'error',
                    text: `Пересчёт месяца упал (шаги: ${run.failed.join(', ') || 'не записаны'}).`,
                };
            }
            const tail = [...run.failed, ...run.skipped];
            return {
                state: 'done',
                text:
                    run.status === 'ok'
                        ? 'Месяц пересчитан: витрина, история стадий, журнал прогноза и проверка точности.'
                        : `Месяц пересчитан частично: пропущены или упали шаги ${tail.join(', ')}.`,
            };
        } catch (error) {
            return errorOutcome('Журнал пересчёта не прочитан', error);
        }
    }
}
