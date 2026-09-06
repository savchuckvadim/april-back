import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';

/** Точка ряда: ключ (дата/окно), значение и объём, по которому оно посчитано. */
export interface XmrPoint {
    key: string;
    value: number;
    n: number;
}

/**
 * Состояние последней точки: в границах, выше UCL, ниже LCL или серия из
 * runLength точек по одну сторону от центра.
 */
export type XmrState = 'in' | 'above' | 'below' | 'run';

export interface XmrResult {
    center: number;
    ucl: number;
    lcl: number;
    movingRangeMean: number;
    state: XmrState;
}

export interface XmrOptions {
    /** Множитель MR̄ для границ (по умолчанию 2,66). */
    sigma?: number;
    /** Длина серии для сигнала 'run' (по умолчанию 7). */
    runLength?: number;
}

const MIN_POINTS = 3;

const mean = (values: readonly number[]): number =>
    values.reduce((acc, value) => acc + value, 0) / values.length;

function detectRun(
    values: readonly number[],
    center: number,
    runLength: number,
): boolean {
    if (runLength < 2 || values.length < runLength) {
        return false;
    }
    const tail = values.slice(-runLength);
    return (
        tail.every(value => value > center) ||
        tail.every(value => value < center)
    );
}

/**
 * Контрольная карта индивидуальных значений (XmR):
 * центр = среднее, MR̄ = среднее |x_i − x_{i−1}|, UCL/LCL = центр ± sigma·MR̄.
 * Если все значения лежат в [0, 1] (доли) — границы обрезаются в [0, 1].
 * Состояние определяется по последней точке; выход за границу важнее серии.
 * Меньше трёх точек → null.
 */
export function xmrLimits(
    points: readonly XmrPoint[],
    options: XmrOptions = {},
): XmrResult | null {
    if (points.length < MIN_POINTS) {
        return null;
    }
    const sigma = options.sigma ?? AI_ANALYTICS_THRESHOLDS.xmrSigma;
    const runLength = options.runLength ?? AI_ANALYTICS_THRESHOLDS.runLength;
    const values = points.map(point => point.value);

    const center = mean(values);
    const movingRanges = values
        .slice(1)
        .map((value, index) => Math.abs(value - values[index]));
    const movingRangeMean = mean(movingRanges);

    const isShare = values.every(value => value >= 0 && value <= 1);
    const rawUcl = center + sigma * movingRangeMean;
    const rawLcl = center - sigma * movingRangeMean;
    const ucl = isShare ? Math.min(1, rawUcl) : rawUcl;
    const lcl = isShare ? Math.max(0, rawLcl) : rawLcl;

    const last = values[values.length - 1];
    let state: XmrState = 'in';
    if (last > ucl) {
        state = 'above';
    } else if (last < lcl) {
        state = 'below';
    } else if (detectRun(values, center, runLength)) {
        state = 'run';
    }

    return { center, ucl, lcl, movingRangeMean, state };
}
