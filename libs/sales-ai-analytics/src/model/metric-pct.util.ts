import { MetricValue, rateMetric } from './metric';

/**
 * Доля 0..1 → проценты 0..100 (value и ci90); n, w, confidence и trend не
 * меняются. Для полей DTO с суффиксом Pct (nextStepDateRatePct,
 * handledRatePct). Без округления — округляет presenter.
 */
export function toPercentMetric(metric: MetricValue): MetricValue {
    return {
        ...metric,
        value: metric.value === null ? null : metric.value * 100,
        ci90: metric.ci90
            ? [metric.ci90[0] * 100, metric.ci90[1] * 100]
            : undefined,
    };
}

/** rateMetric в процентах: доля successes/n с интервалом Уилсона 90 %. */
export function ratePctMetric(successes: number, n: number): MetricValue {
    return toPercentMetric(rateMetric(successes, n));
}
