import {
    AI_ANALYTICS_PARAMS,
    AI_ANALYTICS_PARAM_CODES,
    AI_ANALYTICS_PARAM_DEFAULTS,
    findParam,
} from '../params/registry.const';
import { HOT_CLIENT_DEFINITION_DEFAULT } from '../params/registry.definitions.const';
import type { ParamDescriptor } from '../params/registry.types';

/**
 * Реестр параметров — единый источник правды для модели, снапшотов и блока
 * «Как считаем», поэтому дескрипторы проверяются как данные: уникальность
 * кодов, читаемость по-русски, корректность диапазонов и наличие
 * обязательных по плану параметров.
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

    it('коды в snake_case', () => {
        const wrong = params
            .map(descriptor => descriptor.code)
            .filter(code => !/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(code));

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

    it('breaksSeries стоит только у настроек, рвущих сравнимость', () => {
        const breaking = params
            .filter(descriptor => descriptor.breaksSeries)
            .map(descriptor => descriptor.code)
            .sort();

        expect(breaking).toEqual([
            'deal_chain_min_pct',
            'lag_window_sale_days',
            'min_duration_sec_by_type',
            'tenure_bands',
        ]);
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
});

describe('AI_ANALYTICS_PARAMS: обязательные параметры плана 4.1–4.11', () => {
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
});
