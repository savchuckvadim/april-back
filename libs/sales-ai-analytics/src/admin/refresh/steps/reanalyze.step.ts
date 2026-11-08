import { Injectable } from '@nestjs/common';
import type { ReanalysisRunStatus } from '../../../contracts/reanalysis.types';
import { AiAnalyticsReanalyzeService } from '../../services/ai-analytics-reanalyze.service';
import {
    AI_REFRESH_DEFAULTS,
    type AiRefreshStepOutcome,
} from '../refresh.types';
import {
    errorOutcome,
    sincePhaseStart,
    type AiRefreshStepContext,
    type AiRefreshStepHandler,
} from './refresh-step.types';

/** Фазы переразбора: бесплатный подсчёт, затем сам переразбор. */
export const AI_REFRESH_REANALYZE_PHASES = {
    count: 'count',
    run: 'run',
} as const;

const rub = (price: number | null | undefined): string =>
    `≈ ${Math.round(price ?? 0)} ₽`;

const progressText = (run: ReanalysisRunStatus): string =>
    `Переразбор идёт: часть ${run.part}, сделано ${run.done}, сбоев ${run.failed}, потрачено ${rub(run.price)}.`;

/**
 * Переразбор звонков месяца текущей версией разбора — как кнопки 7–8
 * панели: сначала подсчёт без модели, потом запуск, если звонков не
 * больше потолка. Уже идущий переразбор того же месяца подхватывается,
 * второй не ставится.
 */
@Injectable()
export class AiRefreshReanalyzeStep implements AiRefreshStepHandler {
    readonly code = 'reanalyze' as const;

    constructor(private readonly reanalyze: AiAnalyticsReanalyzeService) {}

    async start({
        scenario,
    }: AiRefreshStepContext): Promise<AiRefreshStepOutcome> {
        try {
            const { run } = await this.reanalyze.status(
                scenario.domain,
                scenario.from,
                scenario.to,
            );
            if (run && !run.dryRun && !run.finished) {
                return {
                    state: 'running',
                    phase: AI_REFRESH_REANALYZE_PHASES.run,
                    text: `Переразбор этого месяца уже идёт — жду его. ${progressText(run)}`,
                };
            }
            return await this.dispatch(scenario, true);
        } catch (error) {
            return errorOutcome('Подсчёт переразбора не поставлен', error);
        }
    }

    async probe(context: AiRefreshStepContext): Promise<AiRefreshStepOutcome> {
        const { scenario, step, now } = context;
        try {
            const { run } = await this.reanalyze.status(
                scenario.domain,
                scenario.from,
                scenario.to,
            );
            const fresh = run !== null && sincePhaseStart(step, run.updatedAt);
            if (step.phase !== AI_REFRESH_REANALYZE_PHASES.run) {
                if (!run || !fresh || !run.dryRun || !run.finished) {
                    return {
                        state: 'running',
                        text: 'Считаю звонки к переразбору (модель не вызывается)…',
                    };
                }
                return await this.afterCount(context, run);
            }
            if (!run || run.dryRun) {
                return { state: 'running', text: 'Переразбор в очереди…' };
            }
            if (run.finished && fresh) {
                return {
                    state: run.failed > 0 && run.done === 0 ? 'error' : 'done',
                    // candidates в частях после первой — остаток, поэтому без «из».
                    text: `Переразобрано ${run.done}, сбоев ${run.failed}, потрачено ${rub(run.price)}.${run.lastError ? ` Последняя ошибка: ${run.lastError}` : ''}`,
                };
            }
            if (
                now.getTime() - Date.parse(run.updatedAt) >
                AI_REFRESH_DEFAULTS.reanalysisStaleMs
            ) {
                return {
                    state: 'error',
                    text: `Переразбор встал: больше часа без движения (сделано ${run.done}). Остальные шаги идут по уже сохранённым разборам.`,
                };
            }
            return { state: 'running', text: progressText(run) };
        } catch (error) {
            return errorOutcome('Состояние переразбора не прочитано', error);
        }
    }

    /** Подсчёт готов: нечего — пропуск, слишком много — стоп, иначе запуск. */
    private async afterCount(
        { scenario }: AiRefreshStepContext,
        count: ReanalysisRunStatus,
    ): Promise<AiRefreshStepOutcome> {
        if (count.candidates === 0) {
            return {
                state: 'skipped',
                text: 'Переразбирать нечего: все разборы месяца уже текущей версии.',
            };
        }
        if (count.candidates > AI_REFRESH_DEFAULTS.reanalysisMaxCalls) {
            return {
                state: 'error',
                text: `Звонков к переразбору ${count.candidates} — больше ${AI_REFRESH_DEFAULTS.reanalysisMaxCalls}: такой объём запускайте вручную (шаги 7–8 панели). Остальные шаги идут по сохранённым разборам.`,
            };
        }
        const started = await this.dispatch(scenario, false);
        return started.state === 'error'
            ? started
            : {
                  ...started,
                  text: `Посчитано ${count.candidates} звонков (оценка ${rub(count.estimate?.estimatedPrice)}) — переразбор запущен.`,
              };
    }

    private async dispatch(
        scenario: AiRefreshStepContext['scenario'],
        dryRun: boolean,
    ): Promise<AiRefreshStepOutcome> {
        const result = await this.reanalyze.run({
            domain: scenario.domain,
            from: scenario.from,
            to: scenario.to,
            dryRun,
            ...(scenario.requestedBy
                ? { requestedBy: scenario.requestedBy }
                : {}),
        });
        if (!result.dispatched) {
            return {
                state: 'error',
                text: `Переразбор не поставлен: ${result.reason ?? 'причина не указана'}`,
            };
        }
        return {
            state: 'running',
            phase: dryRun
                ? AI_REFRESH_REANALYZE_PHASES.count
                : AI_REFRESH_REANALYZE_PHASES.run,
            text: dryRun
                ? 'Считаю звонки к переразбору (модель не вызывается)…'
                : 'Переразбор запущен.',
        };
    }
}
