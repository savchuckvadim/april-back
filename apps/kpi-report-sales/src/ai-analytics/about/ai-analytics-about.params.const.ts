import type { AiAnalyticsParamCode } from '@lib/sales-ai-analytics';

/**
 * Общие перечни кодов реестра для блока «Как считаем» (вынесены из
 * `ai-analytics-about.texts.const.ts` по лимиту 300 строк). Перечень по
 * ручкам закреплён `__tests__/about.spec.ts`.
 */

/**
 * Коды, общие для всех ручек: порог разбора, пороги «мало данных» и
 * доверия (`AI_ANALYTICS_THRESHOLDS`), контрольная карта, гейт совета,
 * привязка звонков к сделкам.
 */
export const AI_ABOUT_SHARED_PARAMS = [
    'golden_kappa_min',
    'min_duration_sec',
    'min_duration_sec_by_type',
    'n_min_none',
    'n_min_ok_score',
    'n_min_ok_rate',
    'n_min_rating',
    'trend_window_calls',
    'xmr_sigma',
    'xmr_run_length',
    'z_compare',
    'evidence_gate_advice',
    'deal_chain_min_pct',
    'deal_chain_exit_pct',
    'pool_min_portals_beta',
] as const satisfies readonly AiAnalyticsParamCode[];

/** Коды норм и советов, общие для обзора и плана дня. */
export const AI_ABOUT_NORM_PARAMS = [
    'kappa_edge_early',
    'kappa_edge_late',
    'kappa_max',
    'kappa_activity_days',
    'kappa_layer_ratio',
    'kappa_portal_to_global',
    'forget_lambda',
    'delta_prac_score',
    'delta_prac_pct',
    'lever_max',
    'lever_lb_level',
    'lever_min_section_calls',
] as const satisfies readonly AiAnalyticsParamCode[];
