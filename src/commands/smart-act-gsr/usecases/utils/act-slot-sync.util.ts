import type { IActSmartItemResult } from '../../services/smart/smart-act-gsr.service';
import type { IContractActPeriodSlot } from '../../services/ork-deals/utils/build-contract-act-periods.util';

/** Допуск по времени для сравнения дат из Bitrix и расчётных ISO (таймзоны). */
const DEFAULT_DATE_TOLERANCE_MS = 86_400_000;

export function coerceSmartActId(
    item: IActSmartItemResult,
): number | undefined {
    if (item.id == null) {
        return undefined;
    }
    const n = Number(item.id);
    return Number.isFinite(n) ? n : undefined;
}

export function isoDatesRoughlyEqual(
    left: string | null | undefined,
    right: string,
    toleranceMs = DEFAULT_DATE_TOLERANCE_MS,
): boolean {
    if (left == null || left === '') {
        return false;
    }
    const a = new Date(left).getTime();
    const b = new Date(right).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) {
        return false;
    }
    return Math.abs(a - b) <= toleranceMs;
}

export function periodMatchesSlot(
    item: IActSmartItemResult,
    slot: IContractActPeriodSlot,
    toleranceMs?: number,
): boolean {
    return (
        isoDatesRoughlyEqual(item.from, slot.from, toleranceMs) &&
        isoDatesRoughlyEqual(item.to, slot.to, toleranceMs)
    );
}

/**
 * Слоты за полностью прошедшие месяцы договора → success (как в actsSummury.expectedClosed).
 * Слот за текущий незавершённый месяц (monthIndex > passedMonths) → inprogress.
 *
 * Важно: при now >= end договора passedMonths === totalMonths, все слоты доходят до success
 * (в т.ч. последний), а не monthIndex < currentMonth — там при currentMonth === totalMonths
 * последний месяц ошибочно оставался inprogress.
 */
export function resolveCreateStageForSlot(
    monthIndex: number,
    passedMonths: number,
): 'success' | 'inprogress' {
    return monthIndex <= passedMonths ? 'success' : 'inprogress';
}

export function findUnusedActMatchingSlot(
    items: IActSmartItemResult[],
    slot: IContractActPeriodSlot,
    usedIds: Set<number>,
): IActSmartItemResult | undefined {
    for (const item of items) {
        const id = coerceSmartActId(item);
        if (id == null || usedIds.has(id)) {
            continue;
        }
        if (periodMatchesSlot(item, slot)) {
            return item;
        }
    }
    return undefined;
}
