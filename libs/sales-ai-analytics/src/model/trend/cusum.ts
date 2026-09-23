/**
 * Табличный CUSUM Пейджа на стандартизованных остатках (план Фазы 3, П1):
 * z_t = (x_t − μ0) / σ, S⁺_t = max(0, S⁺_{t−1} + z_t − k),
 * S⁻_t = max(0, S⁻_{t−1} − z_t − k); μ0 — среднее базовой линии (первые
 * `baselinePoints` точек), σ — MR̄ / d₂ по всему ряду (устойчива к одному
 * сдвигу уровня). Сдвиг объявлен, если на последней точке S⁺ или S⁻ выше
 * h И эта сторона не убывала за последние `baselinePoints` точек — иначе
 * CUSUM без сброса держал бы закончившийся всплеск по h / k точек после
 * возврата к уровню. Начало сдвига — точка после последнего нуля той же
 * стороны. Порог h калибруется циркулярным блочным перестановочным тестом
 * по максимуму статистики (`block-permutation.ts`); правило актуальности
 * ложных флагов не добавляет — оно только снимает часть флагов.
 *
 * Чистые функции.
 */
import { meanOf, personalSigma } from './trend-series';
import type { TrendDirection } from './trend.types';

export interface CusumOptions {
    /** Опорное смещение k, единицы σ (0,5 — настройка на сдвиг 1σ). */
    k: number;
    /** Точек базовой линии для μ0. */
    baselinePoints: number;
}

export interface CusumTrajectory {
    mu0: number;
    sigma: number;
    upper: number[];
    lower: number[];
}

/** Траектории S⁺ и S⁻; null — меньше двух точек или разброса нет. */
export function cusumTrajectory(
    values: readonly number[],
    options: CusumOptions,
): CusumTrajectory | null {
    const sigma = personalSigma(values);
    if (sigma === null) return null;
    const baseline = values.slice(0, Math.max(1, options.baselinePoints));
    const mu0 = meanOf(baseline);
    const k = Math.max(0, options.k);
    const upper: number[] = [];
    const lower: number[] = [];
    let up = 0;
    let down = 0;
    for (const value of values) {
        const z = (value - mu0) / sigma;
        up = Math.max(0, up + z - k);
        down = Math.max(0, down - z - k);
        upper.push(up);
        lower.push(down);
    }

    return { mu0, sigma, upper, lower };
}

/** max_t max(S⁺_t, S⁻_t) — статистика для калибровки; без разброса → 0. */
export function cusumStatistic(
    values: readonly number[],
    options: CusumOptions,
): number {
    const trajectory = cusumTrajectory(values, options);
    if (trajectory === null) return 0;

    return Math.max(0, ...trajectory.upper, ...trajectory.lower);
}

/** Индекс первой точки текущего отклонения стороны (после последнего нуля). */
function excursionStart(side: readonly number[]): number {
    let since = side.length - 1;
    while (since > 0 && side[since - 1] > 0) since -= 1;

    return since;
}

/**
 * Длина текущего выброса доминирующей стороны в точках (0 — на последней
 * точке обе стороны в нуле): столько последних точек калибровка исключает
 * из собственного пула перестановок ряда.
 */
export function cusumExcursion(
    values: readonly number[],
    options: CusumOptions,
): number {
    const trajectory = cusumTrajectory(values, options);
    if (trajectory === null) return 0;
    const last = values.length - 1;
    const side =
        trajectory.upper[last] >= trajectory.lower[last]
            ? trajectory.upper
            : trajectory.lower;

    return side[last] > 0 ? values.length - excursionStart(side) : 0;
}

export interface ShiftDetection {
    direction: TrendDirection;
    /** Первая точка текущего отклонения (после последнего нуля стороны). */
    sinceIndex: number;
    /** Средний уровень с точки начала минус μ0, единицы метрики. */
    magnitude: number;
    /** max(S⁺, S⁻) на последней точке, единицы σ. */
    statistic: number;
    threshold: number;
}

/**
 * Сторона актуальна: на последней точке выше h и не убывает за окно
 * базовой линии (закончившийся всплеск теряет по k за точку).
 */
function isCurrent(
    side: readonly number[],
    h: number,
    window: number,
): boolean {
    const last = side.length - 1;
    const before = side[Math.max(0, last - Math.max(1, window))];

    return side[last] > h && side[last] >= before;
}

/** Сдвиг уровня на последней точке: S⁺ или S⁻ выше h и не угасает. */
export function detectShift(
    values: readonly number[],
    options: CusumOptions & { h: number },
): ShiftDetection | null {
    const trajectory = cusumTrajectory(values, options);
    if (trajectory === null) return null;
    const last = values.length - 1;
    const up = trajectory.upper[last];
    const down = trajectory.lower[last];
    const window = options.baselinePoints;
    const upCurrent = isCurrent(trajectory.upper, options.h, window);
    const downCurrent = isCurrent(trajectory.lower, options.h, window);
    if (!upCurrent && !downCurrent) return null;
    const direction: TrendDirection =
        upCurrent && (!downCurrent || up >= down) ? 'up' : 'down';
    const side = direction === 'up' ? trajectory.upper : trajectory.lower;
    const since = excursionStart(side);

    return {
        direction,
        sinceIndex: since,
        magnitude: meanOf(values.slice(since)) - trajectory.mu0,
        statistic: Math.max(up, down),
        threshold: options.h,
    };
}
