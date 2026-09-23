/**
 * TOST — два односторонних теста эквивалентности средних (Schuirmann,
 * 1987) для парных разностей «первый − второй прогон»: средние двух
 * прогонов эквивалентны, если отвергнуты обе гипотезы «сдвиг ≤ −Δ» и
 * «сдвиг ≥ +Δ», что равносильно интервалу (1 − 2α) целиком внутри (−Δ; Δ).
 * Нормальная аппроксимация с квантилем `z_compare`: квота
 * `retest_budget_calls` даёт ≥ 100 пар, где t-квантиль отличается от z
 * в третьем знаке. Чистые функции: без DI, Bitrix и Prisma.
 */
import { normalCdf } from '../style-shrink';
import {
    AGREEMENT_DEFAULTS,
    DifferenceStats,
    ScalePair,
    TostOptions,
    TostResult,
} from './agreement.types';

/** Разности «первый − второй» по парам с конечными значениями. */
export function pairDifferences(pairs: readonly ScalePair[]): number[] {
    return pairs
        .filter(
            pair => Number.isFinite(pair.first) && Number.isFinite(pair.second),
        )
        .map(pair => pair.first - pair.second);
}

/** Выборочные среднее, sd (n − 1) и SE среднего; пустой набор → null. */
export function differenceStats(
    differences: readonly number[],
): DifferenceStats | null {
    const values = differences.filter(value => Number.isFinite(value));
    const n = values.length;
    if (n === 0) {
        return null;
    }
    const mean = values.reduce((acc, value) => acc + value, 0) / n;
    const sd =
        n > 1
            ? Math.sqrt(
                  values.reduce((acc, value) => acc + (value - mean) ** 2, 0) /
                      (n - 1),
              )
            : 0;
    return { n, mean, sd, se: sd / Math.sqrt(n) };
}

/** (сдвиг)/SE; при SE = 0 — знак сдвига (±∞), 0 при точном равенстве. */
function statistic(shift: number, se: number): number {
    if (se > 0) {
        return shift / se;
    }
    if (shift > 0) {
        return Infinity;
    }
    return shift < 0 ? -Infinity : 0;
}

/**
 * TOST по разностям: pLower — H0: μ_d ≤ −Δ, pUpper — H0: μ_d ≥ +Δ,
 * p = max; эквивалентность — по интервалу d̄ ± z·SE строго внутри (−Δ; Δ).
 * Меньше двух разностей или Δ ≤ 0 → null (sd не определено / граница
 * бессмысленна).
 */
export function tost(
    differences: readonly number[],
    options: TostOptions,
): TostResult | null {
    const stats = differenceStats(differences);
    const { bound } = options;
    if (stats === null || stats.n < 2 || !(bound > 0)) {
        return null;
    }
    const z = options.z ?? AGREEMENT_DEFAULTS.z;
    const alpha = 1 - normalCdf(z);
    const pLower = 1 - normalCdf(statistic(stats.mean + bound, stats.se));
    const pUpper = normalCdf(statistic(stats.mean - bound, stats.se));
    const ci: readonly [number, number] = [
        stats.mean - z * stats.se,
        stats.mean + z * stats.se,
    ];
    return {
        ...stats,
        bound,
        z,
        alpha,
        ci,
        pLower,
        pUpper,
        p: Math.max(pLower, pUpper),
        equivalent: ci[0] > -bound && ci[1] < bound,
    };
}

/** TOST по парам одной шкалы. */
export function tostOfPairs(
    pairs: readonly ScalePair[],
    options: TostOptions,
): TostResult | null {
    return tost(pairDifferences(pairs), options);
}
