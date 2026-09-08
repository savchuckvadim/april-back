/**
 * «Честное мало данных» за период (план §4.11): доверие к значению с
 * учётом разрыва ряда по `comparableFrom`.
 *
 * Вынесено из `model/readiness.ts` отдельным файлом: правила режимов
 * витрины и правила показа одного числа — разные ответственности, а файл
 * модели держится в пределах 300 строк.
 */
import {
    METRIC_CONFIDENCE_REASONS,
    confidenceFor,
    type MetricConfidence,
    type MetricKind,
    type MetricValue,
} from './metric';

/**
 * Доверие к значению за период: ряд до `comparableFrom` разорван сменой
 * версии разбора — `none, reason: 'version-changed'`; иначе обычный порог
 * по объёму (`n < n_min_none` = 8 → `none`).
 */
export function confidenceForPeriod(
    n: number,
    kind: MetricKind,
    periodStart: string,
    comparableFrom: string,
): MetricConfidence {
    const broken =
        comparableFrom !== '' &&
        periodStart !== '' &&
        periodStart < comparableFrom;
    if (broken) {
        return {
            level: 'none',
            reason: METRIC_CONFIDENCE_REASONS.versionChanged,
        };
    }

    return confidenceFor(n, kind);
}

/**
 * Значение метрики за период: при `confidence: none` наружу не уходит ни
 * одного числа (план §5.4) — `value = null`.
 */
export function metricForPeriod(
    value: number | null,
    n: number,
    kind: MetricKind,
    periodStart: string,
    comparableFrom: string,
): MetricValue {
    const confidence = confidenceForPeriod(
        n,
        kind,
        periodStart,
        comparableFrom,
    );

    return {
        value: confidence.level === 'none' ? null : value,
        n,
        confidence,
    };
}
