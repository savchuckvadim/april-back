/**
 * Проверка честности оценки продвижения (постановка
 * ai/tasks/ai-polyansky-method/2026-11-10-deal-movement.md, §7): звонок с
 * продвижением 4–5 («принципиальное согласие», «закрыто») должен через N
 * дней отразиться в переходе стадии сделки вперёд. Ночной счёт движения
 * сделок отмечает у каждого такого звонка итог проверки, витрина считает
 * долю «стадия не сдвинулась». Чистые функции: момент расчёта —
 * параметром.
 *
 * Итог окончательный, как только он известен:
 * - `moved` — переход вперёд по лестнице в (звонок; звонок + N дней] —
 *   отмечается сразу, не дожидаясь N дней (сделка может закрыться раньше
 *   проверки, а переход уже случился);
 * - `still` — N дней прошли, перехода вперёд не было.
 * Пока N дней не прошли и перехода нет — звонок не отмечается.
 */
import { DAY_MS, timeOf } from './deal-movement.timeline';
import type { DealMovementTransition } from './deal-movement.types';

/** С какого продвижения по звонку он проверяется (4–5 из 5). */
export const DEAL_MOVEMENT_PROGRESS_CHECK_MIN = 4;

/**
 * Сколько ночей после срока проверки звонок ещё отмечается: пропущенная
 * ночь счёта не теряет проверку, а снимок не растёт без предела.
 */
export const DEAL_MOVEMENT_PROGRESS_CHECK_SLACK_DAYS = 7;

/** Итог проверки звонка: стадия сдвинулась вперёд / не сдвинулась. */
export const DEAL_MOVEMENT_PROGRESS_OUTCOMES = ['moved', 'still'] as const;
export type DealMovementProgressOutcome =
    (typeof DEAL_MOVEMENT_PROGRESS_OUTCOMES)[number];

/** Отметка проверки одного звонка в ночном снимке. */
export interface DealMovementProgressCheck {
    /** Расшифровка звонка — по ней витрина сцепляет со своими звонками. */
    transcriptionId: string;
    dealId: string;
    /** Момент звонка, ISO 8601. */
    at: string;
    /** Продвижение по звонку (4–5). */
    progress: number;
    outcome: DealMovementProgressOutcome;
}

/** Разобранный звонок сделки в объёме проверки. */
export interface DealMovementProgressCall {
    transcriptionId: string;
    /** Момент звонка, ISO 8601. */
    at: string;
    /** Продвижение 1–5; null — в разборе его нет. */
    progress: number | null;
}

/** Сделка в объёме проверки: вход в текущую стадию и её переходы. */
export interface DealMovementProgressDeal {
    dealId: string;
    /** Вход в текущую стадию, ISO 8601; null — неизвестен. */
    stageEnteredAt: string | null;
    /**
     * Переходы стадий; null — история стадий этой сделки не читалась
     * (тогда смену стадии после звонка проверить нечем).
     */
    transitions: readonly DealMovementTransition[] | null;
    calls: readonly DealMovementProgressCall[];
}

export interface DealMovementProgressCheckOptions {
    /** Момент расчёта, ISO 8601. */
    now: string;
    /** За сколько дней после звонка стадия должна сдвинуться вперёд. */
    checkDays: number;
    /** Сколько ночей после срока звонок ещё отмечается. */
    slackDays?: number;
}

const isForward = (transition: DealMovementTransition): boolean =>
    transition.toOrder > transition.fromOrder;

/** Был ли переход вперёд в (fromMs; toMs]. */
function movedForward(
    transitions: readonly DealMovementTransition[],
    fromMs: number,
    toMs: number,
): boolean {
    return transitions.some(transition => {
        const atMs = timeOf(transition.at);
        return (
            atMs !== null &&
            atMs > fromMs &&
            atMs <= toMs &&
            isForward(transition)
        );
    });
}

/** Итог по одному звонку; null — ещё рано или проверить нечем. */
function outcomeOf(
    deal: DealMovementProgressDeal,
    callMs: number,
    nowMs: number,
    checkDays: number,
): DealMovementProgressOutcome | null {
    const dueMs = callMs + checkDays * DAY_MS;
    const enteredMs =
        deal.stageEnteredAt === null ? null : timeOf(deal.stageEnteredAt);
    const unchanged = enteredMs !== null && enteredMs <= callMs;
    if (!unchanged) {
        // Стадия менялась после звонка: без истории направление неизвестно.
        if (deal.transitions === null) return null;
        if (movedForward(deal.transitions, callMs, Math.min(dueMs, nowMs))) {
            return 'moved';
        }
    }
    return nowMs >= dueMs ? 'still' : null;
}

/**
 * Отметки проверки звонков сделки: звонки с продвижением от
 * `DEAL_MOVEMENT_PROGRESS_CHECK_MIN`, не старше срока проверки плюс
 * запас ночей; итог — только окончательный.
 */
export function checkDealMovementProgress(
    deal: DealMovementProgressDeal,
    options: DealMovementProgressCheckOptions,
): DealMovementProgressCheck[] {
    const nowMs = timeOf(options.now);
    if (nowMs === null || options.checkDays <= 0) return [];
    const slack = options.slackDays ?? DEAL_MOVEMENT_PROGRESS_CHECK_SLACK_DAYS;
    const oldestMs = nowMs - (options.checkDays + slack) * DAY_MS;
    const checks: DealMovementProgressCheck[] = [];
    for (const call of deal.calls) {
        const callMs = timeOf(call.at);
        const progress = call.progress;
        if (
            callMs === null ||
            callMs > nowMs ||
            callMs < oldestMs ||
            progress === null ||
            progress < DEAL_MOVEMENT_PROGRESS_CHECK_MIN
        ) {
            continue;
        }
        const outcome = outcomeOf(deal, callMs, nowMs, options.checkDays);
        if (outcome === null) continue;
        checks.push({
            transcriptionId: call.transcriptionId,
            dealId: deal.dealId,
            at: new Date(callMs).toISOString(),
            progress,
            outcome,
        });
    }
    return checks;
}
