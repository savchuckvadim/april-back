import {
    emptyDealMovementCounts,
    emptyDealMovementNotesSummary,
    type DealMovementNightPlan,
    type DealMovementNotesSummary,
    type DealMovementRunMode,
    type DealMovementRunStatus,
} from '@lib/sales-ai-analytics';
import type { DealMovementNotesOptions } from '../types/deal-movement.types';

/**
 * Состояние прогона портала (Redis, ключ `status`): начало и итог плана
 * ночи. Чистые функции — сервис прогона только сохраняет.
 */

export function initialDealMovementStatus(
    domain: string,
    mode: DealMovementRunMode,
    requestedBy: string,
    now: Date,
): DealMovementRunStatus {
    const startedAt = now.toISOString();
    return {
        domain,
        mode,
        requestedBy,
        phase: 'started',
        startedAt,
        updatedAt: startedAt,
        finished: false,
        openTotal: 0,
        evaluated: 0,
        capped: false,
        baseline: false,
        firstSeen: 0,
        byStatus: emptyDealMovementCounts(),
        changed: 0,
        snapshotDay: null,
        warnings: [],
        error: null,
    };
}

/**
 * Итог записей по плану: сколько записей в плане и сколько отложено
 * лимитом ночи и защитой от метаний. Запись выключена — пустой итог с
 * пометкой «выключено». `heldForNight` — ручной счёт: лимит записей 0,
 * отложенное ждёт ночи. Сделанное считает уже запись в ленту.
 */
export function plannedDealMovementNotes(
    options: DealMovementNotesOptions,
    plan: Pick<
        DealMovementNightPlan,
        'toNotify' | 'deferred' | 'deferredQuiet'
    >,
    heldForNight: boolean,
): DealMovementNotesSummary {
    if (!options.write) return emptyDealMovementNotesSummary(null);
    return {
        ...emptyDealMovementNotesSummary(options.kind),
        heldForNight,
        planned: plan.toNotify.length,
        deferredLimit: plan.deferred - plan.deferredQuiet,
        deferredQuiet: plan.deferredQuiet,
    };
}

/** Итог оценки и плана ночи — в состояние прогона. */
export function applyDealMovementPlan(
    status: DealMovementRunStatus,
    input: {
        readonly openTotal: number;
        readonly evaluated: number;
        readonly capped: boolean;
        readonly baseline: boolean;
        readonly warnings: readonly string[];
        readonly plan: Pick<
            DealMovementNightPlan,
            'firstSeen' | 'byStatus' | 'changes'
        >;
        readonly notes: DealMovementNotesSummary;
    },
): void {
    Object.assign(status, {
        openTotal: input.openTotal,
        evaluated: input.evaluated,
        capped: input.capped,
        baseline: input.baseline,
        firstSeen: input.plan.firstSeen,
        byStatus: input.plan.byStatus,
        changed: input.plan.changes.length,
        notes: input.notes,
        warnings: [...input.warnings],
    });
}
