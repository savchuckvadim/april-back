import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';
import { wilsonInterval } from './wilson';

/** Уровень доверия к метрике по объёму данных (план, раздел 4.11). */
export type ConfidenceLevel = 'ok' | 'low' | 'none';

/** Направление тренда метрики; 'na' — тренд не считается. */
export type MetricTrend = 'up' | 'down' | 'flat' | 'na';

/** Вид метрики: оценка (среднее 1–10) или доля (0..1). */
export type MetricKind = 'score' | 'rate';

/** Канонические причины пониженного доверия (reason в confidence). */
export const METRIC_CONFIDENCE_REASONS = {
    /** n ниже минимума — значение не показываем. */
    notEnoughData: 'not-enough-data',
    /** n достаточно для показа, но мало для выводов. */
    fewData: 'few-data',
    /** Ряд разорван сменой версии разбора (план, 5.4). */
    versionChanged: 'version-changed',
    /** Числитель и знаменатель из разных источников/зёрен времени (4.1). */
    mixedSources: 'mixed-sources',
} as const;

export type MetricConfidenceReason =
    (typeof METRIC_CONFIDENCE_REASONS)[keyof typeof METRIC_CONFIDENCE_REASONS];

export interface MetricConfidence {
    level: ConfidenceLevel;
    reason?: string;
}

/**
 * Значение метрики с «честным мало данных»: value = null при confidence none,
 * n — объём, w — доля собственных данных при усадке (Фаза 2), ci90 — 90 %-й
 * интервал Уилсона для долей.
 */
export interface MetricValue {
    value: number | null;
    n: number;
    w?: number;
    confidence: MetricConfidence;
    ci90?: [number, number];
    trend?: MetricTrend;
}

/**
 * Доверие по объёму: n < scoreNone → none; до порога ok → low; иначе ok.
 * Порог ok: для оценок scoreLow (20), для долей rateOk (30).
 */
export function confidenceFor(n: number, kind: MetricKind): MetricConfidence {
    const { scoreNone, scoreLow, rateOk } = AI_ANALYTICS_THRESHOLDS;
    if (!Number.isFinite(n) || n < scoreNone) {
        return {
            level: 'none',
            reason: METRIC_CONFIDENCE_REASONS.notEnoughData,
        };
    }
    const okFrom = kind === 'rate' ? rateOk : scoreLow;
    if (n < okFrom) {
        return { level: 'low', reason: METRIC_CONFIDENCE_REASONS.fewData };
    }
    return { level: 'ok' };
}

/**
 * Доля successes/n (0..1) с интервалом Уилсона z = 1,645.
 * При confidence none value = null и интервал не отдаётся.
 */
export function rateMetric(successes: number, n: number): MetricValue {
    const confidence = confidenceFor(n, 'rate');
    if (confidence.level === 'none' || n <= 0) {
        return { value: null, n, confidence };
    }
    const hits = Math.min(Math.max(successes, 0), n);
    return {
        value: hits / n,
        n,
        confidence,
        ci90: wilsonInterval(hits, n),
    };
}

/**
 * Среднее набора оценок; n = values.length. При confidence none value = null.
 */
export function scoreMetric(values: readonly number[]): MetricValue {
    const n = values.length;
    const confidence = confidenceFor(n, 'score');
    if (confidence.level === 'none') {
        return { value: null, n, confidence };
    }
    const sum = values.reduce((acc, value) => acc + value, 0);
    return { value: sum / n, n, confidence };
}
