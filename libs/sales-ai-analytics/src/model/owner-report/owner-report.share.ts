import type { OwnerReportCall, OwnerShare } from './owner-report.types';

/**
 * Доля отчёта собственнику: числитель, знаменатель и процент. Правило
 * владельца 06.11.2026 — число показывается при любом n > 0 (с n рядом),
 * null только при пустом знаменателе. Проценты не округляются — округляет
 * слой подачи.
 */
export function shareOf(successes: number, n: number): OwnerShare {
    return {
        successes,
        n,
        pct: n > 0 ? (successes / n) * 100 : null,
    };
}

/** Доля элементов, прошедших предикат, среди тех, где он применим (не null). */
export function shareWhere<T>(
    items: readonly T[],
    applies: (item: T) => boolean | null,
): OwnerShare {
    let n = 0;
    let successes = 0;
    for (const item of items) {
        const verdict = applies(item);
        if (verdict === null) continue;
        n += 1;
        if (verdict) successes += 1;
    }
    return shareOf(successes, n);
}

/** Сумма значений по ключам; отсутствующие ключи — 0, ключ null не считается. */
export function countBy<T, K extends string>(
    items: readonly T[],
    keys: readonly K[],
    keyOf: (item: T) => K | null,
): Record<K, number> {
    const counts = Object.fromEntries(keys.map(key => [key, 0])) as Record<
        K,
        number
    >;
    for (const item of items) {
        const key = keyOf(item);
        if (key !== null) counts[key] += 1;
    }
    return counts;
}

/**
 * Шаг вперёд среди разговоров с размеченным исходом: знаменатель — только
 * они, неразмеченные не превращаются в «не продвинут».
 */
export function advancedShare(calls: readonly OwnerReportCall[]): OwnerShare {
    return shareWhere(calls, call => call.advanced);
}

/** Разговоры, где ЛПР точно или возможно был на линии (не секретарь). */
export function talkedOf(calls: readonly OwnerReportCall[]): OwnerReportCall[] {
    return calls.filter(call => call.contactReached !== false);
}

/** Первые `limit` id в порядке появления, без повторов. */
export function firstIds(ids: readonly string[], limit: number): string[] {
    return [...new Set(ids)].slice(0, limit);
}
