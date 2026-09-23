/**
 * Сигналы одного ряда (план Фазы 3, П1): сдвиг уровня (CUSUM), дрейф
 * (двойная EWMA) и выброс (XmR-карта `model/xmr.ts`) с доверием по числу
 * сравнимых точек. Меньше `minPoints` точек — доверие none и ни одного
 * сигнала; выброс той же стороны, что и сдвиг, не дублируется; серия
 * XmR (`run`) не сигнал — её накрывает CUSUM.
 *
 * Чистые функции.
 */
import { xmrLimits } from '../xmr';
import { detectShift } from './cusum';
import { detectDrift } from './ewma';
import { MOVING_RANGE_D2, personalSigma } from './trend-series';
import {
    TREND_CONFIDENCE_REASONS,
    type TrendDetectOptions,
    type TrendDetection,
    type TrendSeries,
    type TrendSeriesPoint,
    type TrendSignal,
} from './trend.types';

/** Ряд без сигналов с причиной (доверие none). */
function silent(
    reason: TrendDetection['reason'],
    points: number,
): TrendDetection {
    return { confidence: 'none', reason, points, sigma: null, signals: [] };
}

/**
 * Выброс последней точки по XmR-карте: статистика — отклонение от центра
 * в σ_personal, порог — множитель карты в тех же единицах
 * (`xmr_sigma`·d₂ ≈ 3σ).
 */
export function detectOutlier(
    points: readonly TrendSeriesPoint[],
    sigma: number,
    xmrSigma: number,
): TrendSignal | null {
    const limits = xmrLimits(points, { sigma: xmrSigma });
    if (limits === null) return null;
    if (limits.state !== 'above' && limits.state !== 'below') return null;
    const last = points[points.length - 1];
    const magnitude = last.value - limits.center;

    return {
        kind: 'outlier',
        direction: limits.state === 'above' ? 'up' : 'down',
        sinceKey: last.key,
        sinceIndex: points.length - 1,
        magnitude,
        statistic: Math.abs(magnitude) / sigma,
        threshold: xmrSigma * MOVING_RANGE_D2,
    };
}

/** Сигналы ряда в порядке старшинства с доверием по числу точек. */
export function detectTrendSignals(
    series: TrendSeries,
    options: TrendDetectOptions,
): TrendDetection {
    const points = series.points;
    const values = points.map(point => point.value);
    if (points.length < options.minPoints) {
        const broken =
            series.cut.beforeComparable > 0 || series.cut.versionBreak > 0;
        return silent(
            broken
                ? TREND_CONFIDENCE_REASONS.seriesBreak
                : TREND_CONFIDENCE_REASONS.fewPoints,
            points.length,
        );
    }
    const sigma = personalSigma(values);
    if (sigma === null) {
        return silent(TREND_CONFIDENCE_REASONS.noVariance, points.length);
    }
    const signals: TrendSignal[] = [];
    const shift = detectShift(values, {
        k: options.cusumK,
        baselinePoints: options.baselinePoints,
        h: options.thresholds.cusumH,
    });
    if (shift !== null) {
        signals.push({
            kind: 'shift',
            ...shift,
            sinceKey: points[shift.sinceIndex].key,
        });
    }
    const drift = detectDrift(values, {
        alphaShort: options.alphaShort,
        alphaLong: options.alphaLong,
        consecutive: options.consecutive,
        k: options.thresholds.driftK,
    });
    if (drift !== null) {
        signals.push({
            kind: 'drift',
            ...drift,
            sinceKey: points[drift.sinceIndex].key,
        });
    }
    const outlier = detectOutlier(points, sigma, options.thresholds.xmrSigma);
    if (
        outlier !== null &&
        !signals.some(
            signal =>
                signal.kind === 'shift' &&
                signal.direction === outlier.direction,
        )
    ) {
        signals.push(outlier);
    }
    const few = points.length < options.okPoints;

    return {
        confidence: few ? 'low' : 'ok',
        reason: few ? TREND_CONFIDENCE_REASONS.fewPoints : null,
        points: points.length,
        sigma,
        signals,
    };
}
