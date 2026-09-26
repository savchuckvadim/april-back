/**
 * Детектор Гудхарта (план Фазы 3, поток П9 `p3-goodhart`): каждая
 * метрика, по которой давит руководитель, имеет противовес. На сглаженных
 * (EWMA) месячных рядах за окно `goodhart_window_months` давление выросло
 * не меньше `minRise`, а противовес упал не меньше `goodhart_drop` —
 * пара получает флаг «метрика растёт, результат — нет».
 *
 * Ряды выравниваются по общим ключам месяцев: точка есть у обоих рядов,
 * иначе месяц в окно не входит («мало данных» — не ноль). Сравниваются
 * сглаженные значения на первой и последней точке окна; относительное
 * изменение считается от первой точки, поэтому нулевая или отрицательная
 * первая точка делает пару непроверяемой (пропуск, не флаг).
 *
 * `null` — ни одна пара не набрала окна: детектор молчит, пока рядов не
 * накопится (§8 п. 2 плана — три месяца сглаженных рядов).
 *
 * Чистые функции: без DI, Bitrix и `new Date()`.
 */
import { ewma } from './trend/ewma';
import type {
    GoodhartFlag,
    GoodhartOptions,
    GoodhartPair,
    GoodhartResult,
    GoodhartSeriesInput,
} from './goodhart.types';
import type { TrendSeriesPoint } from './trend/trend.types';

/** Дефолты детектора, не имеющие кода реестра. */
export const GOODHART_DEFAULTS = {
    /** Минимальный относительный рост давления — 5 %. */
    minRise: 0.05,
} as const;

/** Пара выровненных значений одного месяца. */
interface AlignedPoint {
    key: string;
    pressure: number;
    counter: number;
}

/** Точки ряда по ключу; повтор ключа — побеждает последняя. */
function byKey(
    points: readonly TrendSeriesPoint[],
): Map<string, TrendSeriesPoint> {
    const map = new Map<string, TrendSeriesPoint>();
    for (const point of points) map.set(point.key, point);

    return map;
}

/** Общие месяцы двух рядов по возрастанию ключа. */
export function alignSeries(
    pressure: readonly TrendSeriesPoint[],
    counter: readonly TrendSeriesPoint[],
): AlignedPoint[] {
    const counterByKey = byKey(counter);

    return [...byKey(pressure).values()]
        .flatMap(point => {
            const other = counterByKey.get(point.key);

            return other === undefined
                ? []
                : [
                      {
                          key: point.key,
                          pressure: point.value,
                          counter: other.value,
                      },
                  ];
        })
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Относительное изменение сглаженного ряда за окно; первая точка ≤ 0 — null. */
export function relativeChange(
    values: readonly number[],
    alpha: number,
): number | null {
    if (values.length < 2) return null;
    const smoothed = ewma(values, alpha);
    const first = smoothed[0];
    const last = smoothed[smoothed.length - 1];
    if (first === undefined || last === undefined || !(first > 0)) return null;

    return (last - first) / first;
}

/** Флаг одной пары; недостаточно окна — undefined, окно есть без расхождения — null. */
function detectPair(
    pair: GoodhartPair,
    series: ReadonlyMap<string, readonly TrendSeriesPoint[]>,
    options: GoodhartOptions,
): GoodhartFlag | null | undefined {
    const windowMonths = Math.max(2, Math.trunc(options.windowMonths));
    const aligned = alignSeries(
        series.get(pair.pressure) ?? [],
        series.get(pair.counter) ?? [],
    );
    if (aligned.length < windowMonths) return undefined;
    const window = aligned.slice(aligned.length - windowMonths);
    const pressureChange = relativeChange(
        window.map(point => point.pressure),
        options.alpha,
    );
    const counterChange = relativeChange(
        window.map(point => point.counter),
        options.alpha,
    );
    if (pressureChange === null || counterChange === null) return undefined;
    const minRise = options.minRise ?? GOODHART_DEFAULTS.minRise;
    if (pressureChange < minRise || counterChange > -options.drop) return null;
    const first = window[0];
    const last = window[window.length - 1];
    if (first === undefined || last === undefined) return undefined;

    return {
        pair: pair.code,
        pressure: pair.pressure,
        counter: pair.counter,
        fromKey: first.key,
        toKey: last.key,
        pressureChange,
        counterChange,
        points: window.length,
    };
}

/**
 * Флаги по всем парам, худший противовес первым (при равенстве — код
 * пары). `null` — ни одна пара не набрала окна общих месяцев.
 */
export function detectGoodhart(
    inputs: readonly GoodhartSeriesInput[],
    pairs: readonly GoodhartPair[],
    options: GoodhartOptions,
): GoodhartResult {
    const series = new Map<string, readonly TrendSeriesPoint[]>(
        inputs.map(input => [input.metric, input.points]),
    );
    let measurable = false;
    const flags: GoodhartFlag[] = [];
    for (const pair of pairs) {
        const flag = detectPair(pair, series, options);
        if (flag === undefined) continue;
        measurable = true;
        if (flag !== null) flags.push(flag);
    }
    if (!measurable) return null;

    return flags.sort(
        (a, b) =>
            a.counterChange - b.counterChange || a.pair.localeCompare(b.pair),
    );
}
