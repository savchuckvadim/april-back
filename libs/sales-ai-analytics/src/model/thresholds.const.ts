/**
 * Пороги «честного мало данных» и параметры статистики AI-аналитики ОП
 * (план ai-sales-analytics, раздел 4.11). Единый источник правды для
 * модели, DTO и фронта; величины берутся из реестра параметров, а не
 * дублируются литералами (находка M8 аудита Фазы 2, `lib-defaults.spec`):
 * контекст портала переопределяет их через `resolveParam` тех же кодов.
 *
 * - scoreNone / scoreLow — n < 8 → 'none', 8–19 → 'low', ≥ 20 → 'ok' (оценки);
 * - rateOk — для долей 'ok' только с n ≥ 30;
 * - ratingMin — порядковый рейтинг людей только при n ≥ 50;
 * - trendWindowCalls — окно тренда качества в разборах (не в неделях);
 * - xmrSigma — множитель MR̄ для границ XmR-карты (2,66 ≈ 3σ);
 * - runLength — серия точек по одну сторону от центра = сигнал «run»;
 * - z90 — квантиль 90 %-интервала Уилсона (`z_compare`);
 * - shortCallSec — звонок короче этого не участвует в знаменателе долей:
 *   дефолт порога разбора по типу (`min_duration_sec_by_type`); карту
 *   порогов портала по типам читает `resolveMinDurationByType`.
 */
import { registryDefault } from '../params/registry.access';

export const AI_ANALYTICS_THRESHOLDS = {
    /** `n_min_none`. */
    scoreNone: registryDefault('n_min_none'),
    /** `n_min_ok_score`. */
    scoreLow: registryDefault('n_min_ok_score'),
    /** `n_min_ok_rate`. */
    rateOk: registryDefault('n_min_ok_rate'),
    /** `n_min_rating`. */
    ratingMin: registryDefault('n_min_rating'),
    /** `trend_window_calls`. */
    trendWindowCalls: registryDefault('trend_window_calls'),
    /** `xmr_sigma`. */
    xmrSigma: registryDefault('xmr_sigma'),
    /** `xmr_run_length`. */
    runLength: registryDefault('xmr_run_length'),
    /** `z_compare`. */
    z90: registryDefault('z_compare'),
    /** `min_duration_sec_by_type`. */
    shortCallSec: registryDefault('min_duration_sec_by_type'),
} as const;

export type AiAnalyticsThresholds = typeof AI_ANALYTICS_THRESHOLDS;
