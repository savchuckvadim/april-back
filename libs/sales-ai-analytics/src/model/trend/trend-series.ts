/**
 * Нормализация ряда менеджера (план Фазы 3, П1): сортировка по ключу
 * периода, отбрасывание точек до границы сравнимой истории
 * (`comparableFrom`, план Фазы 2 §5.4) и до последней смены сигнатуры
 * версий разбора, выбрасывание точек без значения — «мало данных» в
 * периоде не ноль и не провал. Пропуски периодов не заполняются: неделя
 * без разборов — не наблюдение. Здесь же σ_personal ряда.
 *
 * Чистые функции: без DI, Bitrix и `new Date()`.
 */
import type { TrendPoint, TrendSeries, TrendSeriesPoint } from './trend.types';

/**
 * d₂ для скользящего размаха двух точек: σ ≈ MR̄ / 1,128 (та же
 * константа, что внутри множителя XmR 2,66 = 3 / 1,128).
 */
export const MOVING_RANGE_D2 = 1.128;

export interface NormalizeTrendOptions {
    /** Ключ периода, с которого ряд сравним; null или пусто — ряд не рвался. */
    comparableFromKey?: string | null;
}

const compareKeys = (a: string, b: string): number => {
    if (a < b) return -1;

    return a > b ? 1 : 0;
};

/** Точки по возрастанию ключа; повтор ключа — побеждает последняя. */
function sortedUnique(points: readonly TrendPoint[]): TrendPoint[] {
    const byKey = new Map<string, TrendPoint>();
    for (const point of points) byKey.set(point.key, point);

    return [...byKey.values()].sort((a, b) => compareKeys(a.key, b.key));
}

/**
 * Индекс, с которого сигнатура версий не менялась: точки без сигнатуры
 * ряд не рвут, последняя известная сигнатура считается текущей.
 */
export function versionBreakIndex(points: readonly TrendPoint[]): number {
    let current: string | null = null;
    let since = 0;
    points.forEach((point, index) => {
        const signature = point.signature ?? null;
        if (signature === null) return;
        if (current !== null && signature !== current) since = index;
        current = signature;
    });

    return since;
}

/** Ряд после разрывов и без точек «мало данных». */
export function normalizeTrendSeries(
    points: readonly TrendPoint[],
    options: NormalizeTrendOptions = {},
): TrendSeries {
    const comparableFromKey = options.comparableFromKey || null;
    const sorted = sortedUnique(points);
    const comparable =
        comparableFromKey === null
            ? sorted
            : sorted.filter(point => point.key >= comparableFromKey);
    const breakAt = versionBreakIndex(comparable);
    const sameVersion = comparable.slice(breakAt);
    const valued: TrendSeriesPoint[] = [];
    for (const point of sameVersion) {
        if (point.value !== null && Number.isFinite(point.value)) {
            valued.push({ key: point.key, value: point.value, n: point.n });
        }
    }

    return {
        points: valued,
        cut: {
            beforeComparable: sorted.length - comparable.length,
            versionBreak: breakAt,
            noValue: sameVersion.length - valued.length,
        },
        comparableFromKey,
    };
}

export const meanOf = (values: readonly number[]): number =>
    values.length === 0
        ? 0
        : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * σ_personal ряда — средний скользящий размах, делённый на d₂: устойчива
 * к одному сдвигу уровня (в размах попадает лишь одна пара точек).
 * Меньше двух точек или нулевой разброс → null.
 */
export function personalSigma(values: readonly number[]): number | null {
    if (values.length < 2) return null;
    const ranges = values
        .slice(1)
        .map((value, index) => Math.abs(value - values[index]));
    const sigma = meanOf(ranges) / MOVING_RANGE_D2;

    return sigma > 0 && Number.isFinite(sigma) ? sigma : null;
}
