/**
 * Пороги «честного мало данных» и параметры статистики AI-аналитики ОП
 * (план ai-sales-analytics, раздел 4.11). Единый источник правды для
 * модели, DTO и фронта; пересматриваются по итогам Фазы 0.
 *
 * - scoreNone / scoreLow — n < 8 → 'none', 8–19 → 'low', ≥ 20 → 'ok' (оценки);
 * - rateOk — для долей 'ok' только с n ≥ 30;
 * - ratingMin — порядковый рейтинг людей только при n ≥ 50;
 * - trendWindowCalls — окно тренда качества в разборах (не в неделях);
 * - xmrSigma — множитель MR̄ для границ XmR-карты (2,66 ≈ 3σ);
 * - runLength — серия точек по одну сторону от центра = сигнал «run»;
 * - z90 — квантиль 90 %-интервала Уилсона;
 * - shortCallSec — звонок короче этого не участвует в знаменателе долей.
 */
export const AI_ANALYTICS_THRESHOLDS = {
    scoreNone: 8,
    scoreLow: 20,
    rateOk: 30,
    ratingMin: 50,
    trendWindowCalls: 30,
    xmrSigma: 2.66,
    runLength: 7,
    z90: 1.645,
    shortCallSec: 300,
} as const;

export type AiAnalyticsThresholds = typeof AI_ANALYTICS_THRESHOLDS;
