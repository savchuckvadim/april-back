import { shareOf } from './owner-report.share';
import type { OwnerReportPriceRange, OwnerShare } from './owner-report.types';

/**
 * Арифметика слияния месячных фактов в сводные (квартал, полугодие, год):
 * суммы, доли по сумме числителей и знаменателей, взвешенные средние,
 * диапазоны. Вынесено из owner-report.merge.ts по лимиту файла.
 */

export const sumBy = <T>(
    items: readonly T[],
    pick: (item: T) => number,
): number => items.reduce((total, item) => total + pick(item), 0);

/** Сумма долей: числители и знаменатели складываются, процент пересчитывается. */
export const addShares = (shares: readonly OwnerShare[]): OwnerShare =>
    shareOf(
        sumBy(shares, share => share.successes),
        sumBy(shares, share => share.n),
    );

/** Сумма значений, где null — «неизвестно»: все неизвестны → null, иначе сумма известных. */
export function sumNullable(
    values: readonly (number | null | undefined)[],
): number | null {
    const known = values.filter(
        (value): value is number => typeof value === 'number',
    );
    return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

/** Поэлементная сумма одинаково устроенных словарей счётчиков. */
export function sumRecords<K extends string>(
    records: readonly Readonly<Record<K, number>>[],
): Record<K, number> {
    const result = {} as Record<K, number>;
    for (const record of records) {
        for (const key of Object.keys(record) as K[]) {
            result[key] = (result[key] ?? 0) + record[key];
        }
    }
    return result;
}

/** Среднее с весами; пары без значения или с нулевым весом не участвуют. */
export function weightedAvg(
    pairs: readonly { value: number | null; weight: number }[],
): number | null {
    let total = 0;
    let weight = 0;
    for (const pair of pairs) {
        if (pair.value === null || pair.weight <= 0) continue;
        total += pair.value * pair.weight;
        weight += pair.weight;
    }
    return weight > 0 ? total / weight : null;
}

/** Объединённый диапазон цен: минимум из минимумов, максимум из максимумов. */
export function mergeRanges(
    ranges: readonly (OwnerReportPriceRange | null)[],
): OwnerReportPriceRange | null {
    const known = ranges.filter(
        (range): range is OwnerReportPriceRange => range !== null,
    );
    if (known.length === 0) return null;
    return {
        min: Math.min(...known.map(range => range.min)),
        max: Math.max(...known.map(range => range.max)),
        n: sumBy(known, range => range.n),
    };
}

/** Группировка по ключу с сохранением порядка первого появления и слиянием группы. */
export function mergeBy<T, K>(
    items: readonly T[],
    keyOf: (item: T) => K,
    merge: (group: readonly T[]) => T,
): T[] {
    const groups = new Map<K, T[]>();
    for (const item of items) {
        const key = keyOf(item);
        const group = groups.get(key);
        if (group) group.push(item);
        else groups.set(key, [item]);
    }
    return [...groups.values()].map(merge);
}

export const uniqueSorted = (values: readonly string[]): string[] =>
    [...new Set(values)].sort();

/** Последнее непустое значение: месяцы идут по порядку, берём самое свежее. */
export function lastDefined<T>(
    values: readonly (T | null | undefined)[],
): T | null {
    for (let index = values.length - 1; index >= 0; index -= 1) {
        const value = values[index];
        if (value !== null && value !== undefined) return value;
    }
    return null;
}
