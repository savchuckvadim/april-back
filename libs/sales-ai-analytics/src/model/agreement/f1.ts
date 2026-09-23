/**
 * Precision / recall / F1 по множествам кодов (возражения) двух прогонов
 * одного разбора: первый прогон — опорный, второй — проверяемый, поэтому
 * перестановка прогонов меняет precision и recall местами, а F1 не
 * меняет. Итог по всем парам — микро-усреднение (суммы tp/fp/fn), разрез
 * по кодам — те же суммы по одному коду. Повторы кода внутри одного
 * прогона считаются одним. Чистые функции: без DI, Bitrix и Prisma.
 */
import { F1CodeResult, F1Counts, F1Result, SetPair } from './agreement.types';

const EMPTY_COUNTS: F1Counts = { tp: 0, fp: 0, fn: 0 };

/** tp/fp/fn одной пары множеств. */
export function setCounts(pair: SetPair): F1Counts {
    const first = new Set(pair.first);
    const second = new Set(pair.second);
    let tp = 0;
    let fn = 0;
    for (const code of first) {
        if (second.has(code)) {
            tp += 1;
        } else {
            fn += 1;
        }
    }
    let fp = 0;
    for (const code of second) {
        if (!first.has(code)) {
            fp += 1;
        }
    }
    return { tp, fp, fn };
}

/** Поэлементная сумма счётчиков. */
export function sumCounts(items: readonly F1Counts[]): F1Counts {
    return items.reduce(
        (acc, item) => ({
            tp: acc.tp + item.tp,
            fp: acc.fp + item.fp,
            fn: acc.fn + item.fn,
        }),
        EMPTY_COUNTS,
    );
}

/**
 * precision = tp/(tp + fp), recall = tp/(tp + fn),
 * F1 = 2·tp/(2·tp + fp + fn); знаменатель 0 → null (нет свидетельств).
 */
export function f1FromCounts(counts: F1Counts): F1Result {
    const { tp, fp, fn } = counts;
    return {
        tp,
        fp,
        fn,
        precision: tp + fp > 0 ? tp / (tp + fp) : null,
        recall: tp + fn > 0 ? tp / (tp + fn) : null,
        f1: 2 * tp + fp + fn > 0 ? (2 * tp) / (2 * tp + fp + fn) : null,
    };
}

/** Микро-F1 по всем парам: суммы tp/fp/fn, затем формулы. */
export function setF1(pairs: readonly SetPair[]): F1Result {
    return f1FromCounts(sumCounts(pairs.map(setCounts)));
}

/** F1 по каждому коду, встретившемуся хотя бы в одном прогоне; порядок — по коду. */
export function setF1ByCode(pairs: readonly SetPair[]): F1CodeResult[] {
    const counts = new Map<string, F1Counts>();
    for (const pair of pairs) {
        const first = new Set(pair.first);
        const second = new Set(pair.second);
        for (const code of new Set([...first, ...second])) {
            const entry = counts.get(code) ?? { ...EMPTY_COUNTS };
            if (first.has(code) && second.has(code)) {
                entry.tp += 1;
            } else if (first.has(code)) {
                entry.fn += 1;
            } else {
                entry.fp += 1;
            }
            counts.set(code, entry);
        }
    }
    return [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, item]) => ({ code, ...f1FromCounts(item) }));
}
