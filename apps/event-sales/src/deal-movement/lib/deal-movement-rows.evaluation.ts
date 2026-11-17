import {
    dealMovementVerdict,
    effectiveDealLastActivityAt,
    needsDealMovementTodo,
    type DealMovementNightDeal,
    type DealMovementStateEntry,
    type DealMovementThresholds,
    type DealMovementTransition,
    type DealMovementVerdict,
} from '@lib/sales-ai-analytics';
import type {
    DealMovementCallPointers,
    DealMovementCallRef,
    DealMovementDealRow,
} from '../types/deal-movement.types';
import { callPointersOf, callsOf } from './deal-movement-calls.link';
import {
    buildDealMovementDossier,
    toNightDeal,
} from './deal-movement-dossier.mapper';

export interface DealMovementRowsInput {
    readonly rows: readonly DealMovementDealRow[];
    readonly transitions: ReadonlyMap<number, DealMovementTransition[]>;
    readonly calls: ReadonlyMap<number, DealMovementCallRef[]>;
    /** Состояние прошлой ночи; null — базовая линия. */
    readonly previous: ReadonlyMap<string, DealMovementStateEntry> | null;
    /** Момент расчёта, ISO 8601. */
    readonly now: string;
    readonly thresholds: DealMovementThresholds;
}

export interface DealMovementRowsEvaluation {
    readonly deals: DealMovementNightDeal[];
    readonly verdicts: Map<string, DealMovementVerdict>;
    /** Звонки для «что сделать» — только у тревожных статусов со звонками. */
    readonly pointers: Map<string, DealMovementCallPointers>;
}

/**
 * Оценённые сделки ночи: досье, вердикт правил и вход плана. Последняя
 * активность — без нашей записи в ленту (прошлое состояние читается ДО
 * оценки): иначе запись сама сняла бы «застряла». Чистая функция.
 */
export function evaluateDealRows(
    input: DealMovementRowsInput,
): DealMovementRowsEvaluation {
    const deals: DealMovementNightDeal[] = [];
    const verdicts = new Map<string, DealMovementVerdict>();
    const pointers = new Map<string, DealMovementCallPointers>();
    for (const raw of input.rows) {
        const dealId = String(raw.dealId);
        const row: DealMovementDealRow = {
            ...raw,
            lastActivityAt: effectiveDealLastActivityAt(
                raw.lastActivityAt,
                input.previous?.get(dealId) ?? null,
            ),
        };
        const refs = input.calls.get(raw.dealId) ?? [];
        const verdict = dealMovementVerdict(
            buildDealMovementDossier(
                row,
                input.transitions.get(raw.dealId) ?? [],
                callsOf(refs),
            ),
            input.now,
            input.thresholds,
        );
        verdicts.set(dealId, verdict);
        deals.push(toNightDeal(row, verdict));
        if (needsDealMovementTodo(verdict.status) && refs.length > 0) {
            pointers.set(dealId, callPointersOf(refs));
        }
    }
    return { deals, verdicts, pointers };
}
