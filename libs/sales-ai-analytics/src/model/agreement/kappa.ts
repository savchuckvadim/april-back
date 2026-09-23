/**
 * Каппа Коэна по парам категориальных значений одного разбора из двух
 * прогонов (Cohen, 1960), взвешенная каппа для упорядоченных уровней
 * (Cohen, 1968: веса несогласия линейные и квадратичные) и PABAK — каппа
 * с поправкой на распространённость и смещение (Byrt, Bishop, Carlin,
 * 1993). Строки таблицы сопряжённости — первый прогон, столбцы — второй;
 * все метрики симметричны к перестановке прогонов.
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import {
    CategoryPair,
    CohenKappaOptions,
    CohenKappaResult,
    KappaWeighting,
} from './agreement.types';

/** Таблица сопряжённости k × k: строки — первый прогон, столбцы — второй. */
export interface ConfusionTable {
    levels: readonly string[];
    counts: readonly (readonly number[])[];
    /** Пар в таблице: значения вне уровней не считаются. */
    n: number;
}

/**
 * Вес несогласия w_ij ∈ [0, 1] уровней i и j из k: 0 на диагонали, 1 вне
 * её у номинальной каппы, |i − j|/(k − 1) у линейной и квадрат того же —
 * у квадратичной. При k = 2 все три взвешивания совпадают.
 */
export function disagreementWeight(
    i: number,
    j: number,
    k: number,
    weighting: KappaWeighting,
): number {
    if (i === j) {
        return 0;
    }
    if (weighting === 'none' || k < 2) {
        return 1;
    }
    const distance = Math.abs(i - j) / (k - 1);
    return weighting === 'linear' ? distance : distance * distance;
}

/**
 * Уровни категории: заданные (без повторов, в заданном порядке) либо
 * объединение наблюдаемых значений по алфавиту.
 */
export function kappaLevels(
    pairs: readonly CategoryPair[],
    levels?: readonly string[],
): string[] {
    if (levels && levels.length > 0) {
        return [...new Set(levels)];
    }
    const seen = new Set<string>();
    for (const pair of pairs) {
        seen.add(pair.first);
        seen.add(pair.second);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
}

/** Таблица сопряжённости по парам; пары с уровнем вне списка не входят. */
export function confusionTable(
    pairs: readonly CategoryPair[],
    levels: readonly string[],
): ConfusionTable {
    const index = new Map(levels.map((level, at) => [level, at]));
    const counts = levels.map(() => levels.map(() => 0));
    let n = 0;
    for (const pair of pairs) {
        const row = index.get(pair.first);
        const col = index.get(pair.second);
        if (row === undefined || col === undefined) {
            continue;
        }
        counts[row][col] += 1;
        n += 1;
    }
    return { levels, counts, n };
}

/**
 * PABAK = (k·p_o − 1)/(k − 1): каппа при равномерных маргиналах и без
 * смещения между прогонами; при k = 2 это 2·p_o − 1. k < 2 → null.
 */
export function pabakOf(po: number, k: number): number | null {
    if (!(k >= 2) || !Number.isFinite(po)) {
        return null;
    }
    return (k * po - 1) / (k - 1);
}

/**
 * Каппа Коэна: κ = (p_o − p_e)/(1 − p_e) = 1 − D_o/D_e, где D_o — взвешенное
 * наблюдаемое несогласие Σ w_ij·p_ij, D_e — ожидаемое по маргиналам
 * Σ w_ij·p_i·p_j. Без взвешивания — классическая κ; при D_e = 0 (обе
 * серии в одном уровне) κ не определена → null. PABAK — всегда по
 * невзвешенной доле совпадений.
 */
export function cohenKappa(
    pairs: readonly CategoryPair[],
    options: CohenKappaOptions = {},
): CohenKappaResult {
    const weighting = options.weighting ?? 'none';
    const table = confusionTable(pairs, kappaLevels(pairs, options.levels));
    const k = table.levels.length;
    const { n } = table;
    if (n === 0 || k < 2) {
        const trivial = n > 0 ? 1 : 0;
        return {
            n,
            categories: k,
            weighting,
            po: trivial,
            pe: trivial,
            kappa: null,
            pabak: null,
        };
    }
    const rowSums = table.counts.map(row => row.reduce((a, b) => a + b, 0));
    const colSums = table.levels.map((_, j) =>
        table.counts.reduce((acc, row) => acc + row[j], 0),
    );
    let observed = 0;
    let expected = 0;
    let diagonal = 0;
    for (let i = 0; i < k; i += 1) {
        for (let j = 0; j < k; j += 1) {
            const weight = disagreementWeight(i, j, k, weighting);
            observed += (weight * table.counts[i][j]) / n;
            expected += (weight * rowSums[i] * colSums[j]) / (n * n);
            if (i === j) {
                diagonal += table.counts[i][j] / n;
            }
        }
    }
    return {
        n,
        categories: k,
        weighting,
        po: 1 - observed,
        pe: 1 - expected,
        kappa: expected > 0 ? 1 - observed / expected : null,
        pabak: pabakOf(diagonal, k),
    };
}
