import {
    AI_ANALYTICS_PARAM_CODES,
    findParam,
    isAiAnalyticsParamCode,
} from '../params/registry.const';
import {
    AI_ANALYTICS_EDGE_VIEW_CODES,
    AI_ANALYTICS_EDGE_VIEW_MAP,
    AI_EDGE_CODES,
    AI_EDGE_DEFINITIONS,
    edgeByEndpoints,
    edgeCode,
    isAiEdgeCode,
    muEdgeCode,
} from '../params/registry.edges.const';
import {
    AI_ANALYTICS_ANKETA_CODES,
    AI_ANALYTICS_PARAM_MAPPING,
    type AiAnalyticsAnketaCode,
} from '../params/registry.mapping.const';

/**
 * Приёмка плана §2.1 формулируется через покрытие: для каждого из 84 кодов
 * анкеты Ж есть ≥ 1 код реестра, каждый упомянутый код существует, а
 * множество ключей таблицы равно списку анкеты.
 */
describe('AI_ANALYTICS_PARAM_MAPPING: покрытие анкеты Ж', () => {
    const anketa: readonly string[] = AI_ANALYTICS_ANKETA_CODES;
    const keys = Object.keys(AI_ANALYTICS_PARAM_MAPPING);

    it('в анкете Ж ровно 84 уникальных кода', () => {
        expect(anketa.length).toBe(84);
        expect(new Set(anketa).size).toBe(84);
    });

    it('ключи таблицы соответствия равны списку анкеты', () => {
        expect([...keys].sort()).toEqual([...anketa].sort());
    });

    it.each(AI_ANALYTICS_ANKETA_CODES)(
        '%s → хотя бы один существующий код реестра',
        code => {
            const targets = AI_ANALYTICS_PARAM_MAPPING[code];

            expect(targets.length).toBeGreaterThanOrEqual(1);
            expect(new Set(targets).size).toBe(targets.length);
            for (const target of targets) {
                expect(findParam(target)).toBeDefined();
                expect(isAiAnalyticsParamCode(target)).toBe(true);
            }
        },
    );

    it('расщепления §2.1 «один код = один скаляр» именно такие', () => {
        const mapping = AI_ANALYTICS_PARAM_MAPPING;
        const has = (code: AiAnalyticsAnketaCode, ...expected: string[]) =>
            expect(mapping[code]).toEqual(expect.arrayContaining(expected));

        has('kappa_edge', 'kappa_edge_early', 'kappa_edge_late');
        has(
            'n_min_thresholds',
            'n_min_none',
            'n_min_ok_score',
            'n_min_ok_rate',
            'n_min_rating',
        );
        has('delta_prac', 'delta_prac_pct', 'delta_prac_score');
        has(
            'lever_params',
            'lever_max',
            'lever_lb_level',
            'lever_min_section_calls',
            'lever_samples',
        );
        has('m_score_pseudo_n', 'm_s_default', 'm_s_max');
        has('beta_gate', 'beta_gate_se');
        has(
            'beta_quality_near',
            'beta_quality_near_within',
            'beta_quality_near_between',
            'beta_quality_near_pooled',
        );
        has('mu_edge', ...AI_EDGE_CODES.map(edge => muEdgeCode(edge)));
        has(
            'cap_level_activity',
            'cap_cold',
            'cap_call',
            'cap_presentation',
            'cap_quantile',
        );
        has(
            'activity_duration_min',
            'duration_min_cold',
            'duration_min_call',
            'duration_min_presentation',
            'duration_min_refine',
            'duration_min_decision',
            'duration_min_payment',
        );
        has(
            'stage_sla',
            'sla_refine_days',
            'sla_decision_days',
            'sla_money_await_days',
            'sla_first_touch_min',
        );
        has(
            'attention_params',
            'attention_max_items',
            'attention_discipline_pct',
            'attention_n_plan_min',
            'attention_no_next_step_streak',
        );
        has(
            'alert_params',
            'alert_max_per_day',
            'alert_quiet_from_hour',
            'alert_quiet_to_hour',
        );
        has(
            'trend_params',
            'trend_window_calls',
            'trend_ewma_short',
            'trend_ewma_long',
            'trend_sigma_k',
            'trend_fwer',
        );
        has(
            'control_chart_params',
            'xmr_sigma',
            'xmr_run_length',
            'cusum_k',
            'cusum_h',
        );
        has(
            'goodhart_detector',
            'goodhart_drop',
            'goodhart_window_months',
            'next_step_confirm_min',
        );
        has(
            'dq_gates',
            'dq_manager_coverage_pct',
            'dq_noise_share_pct',
            'dq_score_icc_min',
            'dq_timestamp_leak_max',
            'dq_stage_history_months',
            'deal_chain_min_pct',
            'deal_chain_exit_pct',
        );
        has(
            'calibration_gates',
            'calibration_min_months',
            'calibration_min_presentations',
            'calibration_comparable_weeks',
        );
        has('lag_cdf_F', 'lag_cdf_F', 'cif_sale_inf', 'pipeline_estimand');
        has(
            'W_attribution_days',
            'lag_window_near_days',
            'lag_window_sale_days',
        );
        has('status_left_at', 'manager_status', 'manager_left_at');
        has(
            'presentation_canon',
            'presentation_canon',
            'presentation_confirmed_only',
        );
    });

    it('в mu_edge и theta_manager_edge — по два кода на каждое ребро', () => {
        for (const edge of AI_EDGE_CODES) {
            expect(AI_ANALYTICS_PARAM_MAPPING.theta_manager_edge).toContain(
                edgeCode(edge, 'rate'),
            );
            expect(AI_ANALYTICS_PARAM_MAPPING.theta_manager_edge).toContain(
                edgeCode(edge, 'prob'),
            );
        }
    });

    it('все коды реестра, упомянутые в таблице, — подмножество реестра', () => {
        const mentioned = new Set(
            Object.values(AI_ANALYTICS_PARAM_MAPPING).flat(),
        );
        const registry = new Set<string>(AI_ANALYTICS_PARAM_CODES);

        for (const code of mentioned) {
            expect(registry.has(code)).toBe(true);
        }
    });
});

describe('AI_EDGE_CODES: единый источник кодов рёбер', () => {
    it('канон E1, E2, E3, E3′, E4, E5 и полюса рёбер', () => {
        expect(AI_EDGE_CODES).toEqual([
            'e1',
            'e2',
            'e3',
            'e3_prime',
            'e4',
            'e5',
        ]);
        expect(AI_EDGE_DEFINITIONS.map(edge => edge.code)).toEqual(
            AI_EDGE_CODES,
        );
        expect(
            edgeByEndpoints('call_done', 'presentation_uniq_done')?.code,
        ).toBe('e1');
        expect(
            edgeByEndpoints('presentation_uniq_done', 'dealsCount')?.code,
        ).toBe('e5');
        expect(edgeByEndpoints('call_done', 'dealsCount')).toBeUndefined();
    });

    it('edgeCode и muEdgeCode дают коды реестра', () => {
        expect(edgeCode('e3_prime', 'prob')).toBe('e3_prime_prob');
        expect(muEdgeCode('e4')).toBe('mu_e4');
        expect(findParam(edgeCode('e2', 'rate'))?.estimand).toBe('rate');
        expect(findParam(edgeCode('e2', 'prob'))?.intervalKind).toBe('wilson');
        expect(findParam(muEdgeCode('e1'))?.defaultValue).toBe(0.045);
        expect(isAiEdgeCode('e5')).toBe(true);
        expect(isAiEdgeCode('call_to_presentation')).toBe(false);
    });

    it('карта на коды витрины: ключи — канон, значения — витрина или null', () => {
        expect(Object.keys(AI_ANALYTICS_EDGE_VIEW_MAP).sort()).toEqual(
            [...AI_EDGE_CODES].sort(),
        );
        for (const view of Object.values(AI_ANALYTICS_EDGE_VIEW_MAP)) {
            if (view !== null) {
                expect(AI_ANALYTICS_EDGE_VIEW_CODES).toContain(view);
            }
        }
        expect(AI_ANALYTICS_EDGE_VIEW_MAP.e1).toBe('call_to_presentation');
        expect(AI_ANALYTICS_EDGE_VIEW_MAP.e4).toBe('invoice_to_sale');
        expect(AI_ANALYTICS_EDGE_VIEW_MAP.e3_prime).toBeNull();
    });
});
