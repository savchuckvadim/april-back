/**
 * Пул переразбора части: до `concurrency` звонков одновременно (решение
 * владельца 09.11.2026 — три на портал), бюджет времени части, серия
 * сбоев → по одному звонку, длинная серия → остановка части (модель или
 * Битрикс лежат — крутить очередь дальше бессмысленно). Итог каждого
 * звонка отдаётся наружу сразу: статус прогона пишется после каждого.
 *
 * Без DI, Bitrix и `new Date()` — время приходит функцией.
 */
import type { AnalysisUsageColumns } from '../../agent-gate/services/agent-analysis-usage.util';

/** Итог переразбора одного звонка: расход либо текст ошибки. */
export type ReanalysisOneOutcome =
    | { ok: true; usage: AnalysisUsageColumns }
    | { ok: false; error: string };

export interface ReanalysisPoolOptions {
    /** Звонков одновременно на старте части. */
    concurrency: number;
    /** Сбоев подряд, после которых — по одному звонку до конца части. */
    serialAfterFailures: number;
    /** Сбоев подряд, после которых часть останавливается. */
    stopAfterFailures: number;
    /** Бюджет времени части, мс, от `startedAt`. */
    timeBudgetMs: number;
    startedAt: number;
    now: () => number;
}

export interface ReanalysisPoolState {
    /** Обработано в этой части (успех + сбой). */
    processed: number;
    doneInPart: number;
    /** Сбоев подряд на данный момент; успех обнуляет. */
    failStreak: number;
    /** Текущая одновременность: после серии сбоев — один. */
    concurrency: number;
    /** Часть остановлена серией сбоев. */
    stopped: boolean;
    timeBudgetHit: boolean;
}

/** Счётчики пула после итога звонка; серия сбоев снижает одновременность. */
function account(
    state: ReanalysisPoolState,
    outcome: ReanalysisOneOutcome,
    options: ReanalysisPoolOptions,
): void {
    state.processed += 1;
    if (outcome.ok) {
        state.doneInPart += 1;
        state.failStreak = 0;
        return;
    }
    state.failStreak += 1;
    if (state.failStreak >= options.stopAfterFailures) {
        state.stopped = true;
        return;
    }
    if (state.failStreak >= options.serialAfterFailures) {
        state.concurrency = 1;
    }
}

/**
 * Прогон очереди пулом воркеров. `run` — разбор одного звонка (ошибки уже
 * превращены в `{ ok: false }`), `onOutcome` — учёт итога (счётчики
 * статуса и его запись). Воркеры сверх текущей одновременности выходят,
 * когда заканчивают свой звонок; бюджет времени проверяется перед каждым.
 */
export async function runReanalysisPool<T>(
    items: readonly T[],
    run: (item: T) => Promise<ReanalysisOneOutcome>,
    onOutcome: (
        outcome: ReanalysisOneOutcome,
        elapsedMs: number,
        state: ReanalysisPoolState,
    ) => Promise<void>,
    options: ReanalysisPoolOptions,
): Promise<ReanalysisPoolState> {
    const state: ReanalysisPoolState = {
        processed: 0,
        doneInPart: 0,
        failStreak: 0,
        concurrency: Math.max(1, options.concurrency),
        stopped: false,
        timeBudgetHit: false,
    };
    let next = 0;
    const worker = async (slot: number): Promise<void> => {
        while (slot < state.concurrency && !state.stopped) {
            if (options.now() - options.startedAt > options.timeBudgetMs) {
                state.timeBudgetHit = true;
                return;
            }
            const index = next;
            next += 1;
            if (index >= items.length) return;
            const begin = options.now();
            const outcome = await run(items[index]);
            account(state, outcome, options);
            await onOutcome(outcome, options.now() - begin, state);
        }
    };
    await Promise.all(
        Array.from({ length: state.concurrency }, (_, slot) => worker(slot)),
    );

    return state;
}
