import {
    checkDealMovementProgress,
    type DealMovementProgressCheck,
    type DealMovementTransition,
} from '@lib/sales-ai-analytics';
import type {
    DealMovementCallRef,
    DealMovementDealRow,
} from '../types/deal-movement.types';

export interface DealMovementProgressChecksInput {
    readonly rows: readonly DealMovementDealRow[];
    /** Переходы стадий тех сделок, чья история читалась этой ночью. */
    readonly transitions: ReadonlyMap<number, DealMovementTransition[]>;
    /** Сделки, у которых история стадий читалась (у остальных её нет). */
    readonly historyRead: ReadonlySet<number>;
    readonly calls: ReadonlyMap<number, readonly DealMovementCallRef[]>;
    /** Момент расчёта, ISO 8601. */
    readonly now: string;
    /** За сколько дней после звонка стадия должна сдвинуться вперёд. */
    readonly checkDays: number;
}

/**
 * Проверка продвижения звонков по оценённым сделкам ночи — для витрины
 * «честность оценок». Только сделки со звонками; история стадий есть у
 * сделок, сдвигавшихся за окно, — у остальных смена стадии после звонка
 * не проверяется (звонок не отмечается). Чистая функция.
 */
export function dealMovementProgressChecks(
    input: DealMovementProgressChecksInput,
): DealMovementProgressCheck[] {
    const checks: DealMovementProgressCheck[] = [];
    for (const row of input.rows) {
        const refs = input.calls.get(row.dealId);
        if (!refs || refs.length === 0) continue;
        checks.push(
            ...checkDealMovementProgress(
                {
                    dealId: String(row.dealId),
                    stageEnteredAt: row.movedAt ?? row.createdAt,
                    transitions: input.historyRead.has(row.dealId)
                        ? (input.transitions.get(row.dealId) ?? [])
                        : null,
                    calls: refs.map(ref => ({
                        transcriptionId: ref.transcriptionId,
                        at: ref.call.at,
                        progress: ref.call.progress,
                    })),
                },
                { now: input.now, checkDays: input.checkDays },
            ),
        );
    }
    return checks;
}
