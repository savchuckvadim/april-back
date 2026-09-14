import {
    AI_ANALYTICS_PARAMS,
    AI_ANALYTICS_PARAM_CODES,
    AI_ANALYTICS_PARAM_DEFAULTS,
    findParam,
} from '../params/registry.const';
import { HOT_CLIENT_DEFINITION_DEFAULT } from '../params/registry.definitions.const';
import {
    AI_EDGE_CODES,
    edgeCode,
    muEdgeCode,
} from '../params/registry.edges.const';
import { REGISTRY_VERSION, registryVersionOf } from '../params/params-version';
import type { ParamDescriptor } from '../params/registry.types';
import {
    csvItems,
    paramValueKind,
    validateParamValue,
} from '../params/registry.validate';

/**
 * Реестр параметров — единый источник правды для модели, снапшотов и блока
 * «Как считаем», поэтому дескрипторы проверяются как данные: уникальность
 * кодов, читаемость по-русски, корректность диапазонов, правило «один код
 * = один скаляр» и наличие обязательных по плану §2.1–2.2 параметров.
 */
describe('AI_ANALYTICS_PARAMS: состав реестра', () => {
    const params: readonly ParamDescriptor[] = AI_ANALYTICS_PARAMS;

    it('коды уникальны', () => {
        const codes = params.map(descriptor => descriptor.code);
        const duplicates = codes.filter(
            (code, index) => codes.indexOf(code) !== index,
        );

        expect(duplicates).toEqual([]);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('коды в snake_case (прописная допустима только в сегменте: lag_cdf_F)', () => {
        const wrong = params
            .map(descriptor => descriptor.code)
            .filter(code => !/^[a-z][a-z0-9]*(_[a-zA-Z0-9]+)*$/.test(code));

        expect(wrong).toEqual([]);
    });

    it('у каждого параметра непустые русские title и description', () => {
        for (const descriptor of params) {
            expect(descriptor.title.trim().length).toBeGreaterThan(5);
            expect(descriptor.description.trim().length).toBeGreaterThan(40);
            expect(descriptor.unit.trim().length).toBeGreaterThan(0);
            expect(/[а-яА-ЯёЁ]/.test(descriptor.title)).toBe(true);
            expect(/[а-яА-ЯёЁ]/.test(descriptor.description)).toBe(true);
        }
    });

    it('один код = один скаляр: дефолт — примитив, и он проходит свой же валидатор', () => {
        for (const descriptor of params) {
            expect(['number', 'string', 'boolean']).toContain(
                typeof descriptor.defaultValue,
            );
            expect(
                validateParamValue(descriptor, descriptor.defaultValue),
            ).toBe(undefined);
        }
    });

    it('вид значения согласован с типом дефолта и словарём', () => {
        for (const descriptor of params) {
            const kind = paramValueKind(descriptor);
            if (kind === 'number' || kind === 'boolean') {
                expect(typeof descriptor.defaultValue).toBe(kind);
                continue;
            }
            expect(typeof descriptor.defaultValue).toBe('string');
            if (kind === 'enum') {
                expect(
                    descriptor.enumValues?.length ?? 0,
                ).toBeGreaterThanOrEqual(1);
                expect(descriptor.enumValues).toContain(
                    descriptor.defaultValue,
                );
            }
            if (kind === 'csv' && descriptor.enumValues) {
                for (const item of csvItems(String(descriptor.defaultValue))) {
                    expect(descriptor.enumValues).toContain(item);
                }
            }
            if (kind === 'json') {
                const parsed: unknown = JSON.parse(
                    String(descriptor.defaultValue),
                );
                expect(typeof parsed).toBe('object');
                expect(parsed).not.toBeNull();
            }
        }
    });

    it('диапазон корректен и накрывает дефолт', () => {
        for (const descriptor of params) {
            if (descriptor.range === undefined) {
                continue;
            }
            const [min, max] = descriptor.range;
            expect(Number.isFinite(min)).toBe(true);
            expect(Number.isFinite(max)).toBe(true);
            expect(min).toBeLessThan(max);
            expect(typeof descriptor.defaultValue).toBe('number');
            expect(descriptor.defaultValue).toBeGreaterThanOrEqual(min);
            expect(descriptor.defaultValue).toBeLessThanOrEqual(max);
        }
    });

    it('нечисловые параметры диапазона не имеют', () => {
        const wrong = params.filter(
            descriptor =>
                typeof descriptor.defaultValue !== 'number' &&
                descriptor.range !== undefined,
        );

        expect(wrong.map(descriptor => descriptor.code)).toEqual([]);
    });

    it('у оценок есть estimator, у гибридов — числовой прайор', () => {
        for (const descriptor of params) {
            if (descriptor.source === 'estimated') {
                expect(descriptor.estimator?.length ?? 0).toBeGreaterThan(5);
            }
            if (
                descriptor.source === 'hybrid' &&
                typeof descriptor.defaultValue === 'number'
            ) {
                expect(typeof descriptor.prior).toBe('number');
                expect(descriptor.prior).toBe(descriptor.defaultValue);
            }
            if (descriptor.source === 'configured') {
                expect(descriptor.estimator).toBeUndefined();
            }
        }
    });

    it('у рёбер воронки есть intervalKind и estimand, у β — estimand', () => {
        const edgeRate = findParam('theta_edge_rate');
        const edgeProb = findParam('theta_edge_prob');

        expect(edgeRate?.intervalKind).toBe('gamma');
        expect(edgeRate?.estimand).toBe('rate');
        expect(edgeProb?.intervalKind).toBe('wilson');
        expect(edgeProb?.estimand).toBe('prob');
        expect(findParam('beta_quality_near_within')?.estimand).toBe('within');
        expect(findParam('beta_quality_near_between')?.estimand).toBe(
            'between',
        );
        expect(findParam('beta_quality_near_pooled')?.estimand).toBe('pooled');
    });

    it('§2.3: по два кода на каждое ребро E1…E5 со своими intervalKind/estimand', () => {
        for (const edge of AI_EDGE_CODES) {
            const rate = findParam(edgeCode(edge, 'rate'));
            const prob = findParam(edgeCode(edge, 'prob'));
            const mu = findParam(muEdgeCode(edge));

            expect(rate?.estimand).toBe('rate');
            expect(rate?.intervalKind).toBe('gamma');
            expect(rate?.range).toEqual([0, 200]);
            expect(prob?.estimand).toBe('prob');
            expect(prob?.intervalKind).toBe('wilson');
            expect(prob?.range).toEqual([0, 1]);
            expect(mu?.source).toBe('hybrid');
            expect(mu?.range).toEqual([0.001, 0.99]);
        }
        expect(findParam(muEdgeCode('e1'))?.defaultValue).toBe(0.045);
        expect(findParam(muEdgeCode('e5'))?.defaultValue).toBe(0.09);
    });

    it('breaksSeries: восемь кодов определений §2.1 и ничего лишнего', () => {
        const definitionCodes = [
            'call_done_includes_site_come_call',
            'invoice_nesting',
            'min_duration_sec',
            'min_duration_sec_by_type',
            'presentation_canon',
            'productive_call_definition',
            'scoring_applicability',
            'scoring_caps',
        ];
        for (const code of definitionCodes) {
            expect(findParam(code)?.breaksSeries).toBe(true);
        }
        const breaking = params
            .filter(descriptor => descriptor.breaksSeries)
            .map(descriptor => descriptor.code)
            .sort();

        // Сверх восьми: тумблер «только подтверждённые» — вторая половина
        // канона презентации, и три гиперпараметра, чьи описания и спека
        // настроек (ai-settings.sanity.spec) фиксируют разрыв ряда.
        expect(breaking).toEqual(
            [
                ...definitionCodes,
                'presentation_confirmed_only',
                'deal_chain_min_pct',
                'lag_window_sale_days',
                'tenure_bands',
            ].sort(),
        );
    });

    it('findParam отдаёт дескриптор по коду и undefined на чужой код', () => {
        expect(findParam('forget_lambda')?.defaultValue).toBe(0.85);
        expect(findParam('нет такого кода')).toBeUndefined();
    });

    it('AI_ANALYTICS_PARAM_DEFAULTS повторяет дефолты дескрипторов', () => {
        expect(Object.keys(AI_ANALYTICS_PARAM_DEFAULTS).length).toBe(
            params.length,
        );
        expect(AI_ANALYTICS_PARAM_CODES.length).toBe(params.length);
        for (const descriptor of params) {
            expect(AI_ANALYTICS_PARAM_DEFAULTS[descriptor.code]).toBe(
                descriptor.defaultValue,
            );
        }
    });

    it('registryVersion меняется при смене дефолта любого кода', () => {
        const patched = params.map(descriptor =>
            descriptor.code === 'kappa_edge_late'
                ? { ...descriptor, defaultValue: 31 }
                : descriptor,
        );

        expect(registryVersionOf(params)).toBe(REGISTRY_VERSION);
        expect(registryVersionOf(patched)).not.toBe(REGISTRY_VERSION);
    });
});

describe('AI_ANALYTICS_PARAMS: обязательные параметры плана §2.1–2.2', () => {
    const required: readonly string[] = [
        'min_duration_sec_by_type',
        'forget_lambda',
        'kappa_activity_days',
        'kappa_edge_early',
        'kappa_edge_late',
        'kappa_max',
        'kappa_layer_ratio',
        'kappa_portal_to_global',
        'kappa_boot_ratio',
        'absence_proxy_min_run',
        'min_workdays_month',
        'overdispersion_default',
        'm_s_default',
        'm_s_max',
        'sigma_llm_default',
        's_ref',
        'tenure_bands',
        'tenure_gates',
        'ramp_tau0_months',
        'ramp_volume_boost',
        'cycle_median_days',
        'lag_window_sale_days',
        'f_min',
        'plan_day_ceiling',
        'cap_level_activity',
        'n_min_none',
        'n_min_ok_score',
        'n_min_ok_rate',
        'n_min_rating',
        'delta_prac_pct',
        'delta_prac_score',
        'z_compare',
        'lever_lb_level',
        'lever_max',
        'goodhart_window_months',
        'next_step_confirm_min',
        'beta_gate_se',
        'pool_min_portals_beta',
        'hot_client_definition',
        'hot_client_colors',
        'brief_quota_per_day',
        'llm_price_per_1k',
        'retest_budget_calls',
        'trend_window_calls',
        'trend_sigma_k',
        'style_interval_z',
        'style_min_calls',
        'style_min_peers',
        'style_tenure_kappa',
        'style_rope_delta',
        'style_p_in',
        'style_p_out',
        'style_z_raw',
        // §2.2 «добавить»
        'norm_stratum',
        'roster_confirm_required',
        'lever_min_section_calls',
        'lever_samples',
        'pipeline_estimand',
        'cif_sale_inf',
        'lag_cdf_F',
        'dq_timestamp_leak_max',
        'dq_score_icc_min',
        'icc_form',
        'exclude_from_norms',
        'cap_quantile',
        'coaching_hours_section',
        's_req_max',
        'day_hours',
        'fte_share',
        'fte_share_default',
        'sla_refine_days',
        'sla_decision_days',
        'sla_money_await_days',
        'attention_max_items',
        'attention_discipline_pct',
        'attention_n_plan_min',
        'attention_no_next_step_streak',
        'company_color_field',
        'kappa_season_years',
        'tau_prior_sd',
        'kappa_beta',
        'trend_ewma_short',
        'trend_ewma_long',
        'trend_fwer',
        // Коды контекста настроек (registry-context.builder)
        'funnel_edges',
        'decision_stages',
        'presentation_canon',
        'productive_call_definition',
        'invoice_nesting',
        'call_done_includes_site_come_call',
        'training_min_presentations',
        'cap_cold',
        'target_sales_by_level',
        'target_override',
    ];

    it.each(required)('%s есть в реестре', code => {
        expect(findParam(code)).toBeDefined();
    });

    it('решение А.1: порог длительности отсекает разбор и рвёт ряды', () => {
        const descriptor = findParam('min_duration_sec_by_type');

        expect(descriptor?.scope).toBe('portal');
        expect(descriptor?.source).toBe('configured');
        expect(descriptor?.defaultValue).toBe(300);
        expect(descriptor?.range).toEqual([30, 600]);
        expect(descriptor?.breaksSeries).toBe(true);
    });

    it('решение А.2: горячий клиент — стадия «В решении» и выше', () => {
        expect(findParam('hot_client_definition')?.defaultValue).toBe(
            HOT_CLIENT_DEFINITION_DEFAULT,
        );
        expect(HOT_CLIENT_DEFINITION_DEFAULT).toBe(
            'stage_from:sales_in_progress',
        );
    });

    it('решение А.3: пула порталов нет — усадка к глобальному слою нулевая', () => {
        expect(findParam('kappa_portal_to_global')?.defaultValue).toBe(0);
        expect(findParam('pool_opt_in')?.defaultValue).toBe(false);
    });

    it('дефолты статистических порогов совпадают с планом', () => {
        expect(findParam('forget_lambda')?.defaultValue).toBe(0.85);
        expect(findParam('kappa_activity_days')?.defaultValue).toBe(20);
        expect(findParam('kappa_edge_early')?.defaultValue).toBe(100);
        expect(findParam('kappa_edge_late')?.defaultValue).toBe(30);
        expect(findParam('kappa_max')?.defaultValue).toBe(500);
        expect(findParam('kappa_layer_ratio')?.defaultValue).toBe(0.4);
        expect(findParam('n_min_none')?.defaultValue).toBe(8);
        expect(findParam('n_min_ok_score')?.defaultValue).toBe(20);
        expect(findParam('n_min_ok_rate')?.defaultValue).toBe(30);
        expect(findParam('n_min_rating')?.defaultValue).toBe(50);
        expect(findParam('z_compare')?.defaultValue).toBe(1.645);
        expect(findParam('beta_gate_se')?.defaultValue).toBe(0.07);
        expect(findParam('style_p_in')?.defaultValue).toBe(0.8);
        expect(findParam('style_p_out')?.defaultValue).toBe(0.6);
        expect(findParam('style_z_raw')?.defaultValue).toBe(2.33);
    });

    it('дефолты и диапазоны новых кодов §2.2 совпадают с планом', () => {
        expect(findParam('lag_cdf_F')?.range).toEqual([0, 1]);
        expect(findParam('lag_cdf_F')?.source).toBe('estimated');
        expect(findParam('cif_sale_inf')?.defaultValue).toBe(0.09);
        expect(findParam('cif_sale_inf')?.range).toEqual([0.03, 0.3]);
        expect(findParam('pipeline_estimand')?.defaultValue).toBe('cure');
        expect(findParam('roster_confirm_required')?.defaultValue).toBe(false);
        expect(findParam('roster_confirm_required')?.scope).toBe('global');
        expect(findParam('s_req_max')?.defaultValue).toBe(9);
        expect(findParam('s_req_max')?.range).toEqual([7, 9.5]);
        expect(findParam('cap_quantile')?.defaultValue).toBe(0.9);
        expect(findParam('lever_min_section_calls')?.defaultValue).toBe(20);
        expect(findParam('lever_samples')?.defaultValue).toBe(2000);
        expect(findParam('dq_timestamp_leak_max')?.defaultValue).toBe(0.05);
        expect(findParam('norm_stratum')?.defaultValue).toBe('tenure');
        expect(findParam('exclude_from_norms')?.defaultValue).toBe(false);
        expect(findParam('duration_min_cold')?.defaultValue).toBe(6);
        expect(findParam('duration_min_payment')?.defaultValue).toBe(8);
        expect(findParam('sla_decision_days')?.defaultValue).toBe(21);
        expect(findParam('attention_max_items')?.defaultValue).toBe(7);
        expect(findParam('trend_ewma_short')?.defaultValue).toBe(0.3);
        expect(findParam('trend_fwer')?.range).toEqual([0.05, 0.2]);
        expect(findParam('kappa_beta')?.defaultValue).toBe(20);
    });
});
