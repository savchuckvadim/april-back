/**
 * Экспоненциальные скользящие средние и дрейф (план Фазы 3, П1): короткая
 * EWMA (`trend_ewma_short`) быстро следует за рядом, длинная
 * (`trend_ewma_long`) держит уровень; их расхождение в единицах
 * σ_personal и есть статистика дрейфа. Флаг — расхождение выше k
 * `consecutive` окон подряд (`trend_sigma_k`: «два окна подряд»); k
 * поднимается калибровкой (`block-permutation.ts`), чтобы семейство
 * менеджеров × метрик держало FWER ≤ `trend_fwer`.
 *
 * Чистые функции.
 */
import { personalSigma } from './trend-series';
import type { TrendDirection } from './trend.types';

/** α вне (0; 1] — ошибка входа, а не тихое зануление: берём границу. */
const clampAlpha = (alpha: number): number =>
    Number.isFinite(alpha) ? Math.min(1, Math.max(Number.EPSILON, alpha)) : 1;

/**
 * EWMA с началом в первой точке: y₀ = x₀, y_t = α·x_t + (1 − α)·y_{t−1}.
 * Пустой ряд → пустая траектория.
 */
export function ewma(values: readonly number[], alpha: number): number[] {
    const a = clampAlpha(alpha);
    const out: number[] = [];
    let level = 0;
    values.forEach((value, index) => {
        level = index === 0 ? value : a * value + (1 - a) * level;
        out.push(level);
    });

    return out;
}

export interface DriftOptions {
    alphaShort: number;
    alphaLong: number;
    /** Окон подряд над порогом для флага. */
    consecutive: number;
}

/**
 * Статистика дрейфа по точкам: |EWMA_short − EWMA_long| / σ_personal;
 * null — σ не определена (меньше двух точек или разброса нет).
 */
export function driftStatistics(
    values: readonly number[],
    options: Pick<DriftOptions, 'alphaShort' | 'alphaLong'>,
): number[] | null {
    const sigma = personalSigma(values);
    if (sigma === null) return null;
    const short = ewma(values, options.alphaShort);
    const long = ewma(values, options.alphaLong);

    return short.map((value, index) => Math.abs(value - long[index]) / sigma);
}

/**
 * Минимум статистики за `consecutive` последних окон в каждой точке —
 * «выше порога k окон подряд» ⇔ этот минимум выше порога. Пока окно не
 * набрано, минимум равен нулю.
 */
export function runningMin(
    stats: readonly number[],
    consecutive: number,
): number[] {
    const width = Math.max(1, Math.floor(consecutive));

    return stats.map((_, index) =>
        index + 1 < width
            ? 0
            : Math.min(...stats.slice(index + 1 - width, index + 1)),
    );
}

/** Статистика ряда для калибровки порога: максимум окна по всем точкам. */
export function driftStatistic(
    values: readonly number[],
    options: DriftOptions,
): number {
    const stats = driftStatistics(values, options);
    if (stats === null) return 0;

    return Math.max(0, ...runningMin(stats, options.consecutive));
}

export interface DriftDetection {
    direction: TrendDirection;
    /** Первая точка текущей серии превышений порога. */
    sinceIndex: number;
    /** EWMA_short − EWMA_long на последней точке, единицы метрики. */
    magnitude: number;
    /** Минимум статистики за окно на последней точке, единицы σ. */
    statistic: number;
    threshold: number;
}

/** Дрейф на последней точке: минимум статистики за окно выше k. */
export function detectDrift(
    values: readonly number[],
    options: DriftOptions & { k: number },
): DriftDetection | null {
    const stats = driftStatistics(values, options);
    if (stats === null || stats.length === 0) return null;
    const runs = runningMin(stats, options.consecutive);
    const last = stats.length - 1;
    if (!(runs[last] > options.k)) return null;
    let since = last;
    while (since > 0 && stats[since - 1] > options.k) since -= 1;
    const short = ewma(values, options.alphaShort)[last];
    const long = ewma(values, options.alphaLong)[last];
    const magnitude = short - long;

    return {
        direction: magnitude >= 0 ? 'up' : 'down',
        sinceIndex: since,
        magnitude,
        statistic: runs[last],
        threshold: options.k,
    };
}
