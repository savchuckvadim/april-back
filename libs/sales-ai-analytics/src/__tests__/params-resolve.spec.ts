import {
    REGISTRY_VERSION,
    canonicalJson,
    paramsVersion,
} from '../params/params-version';
import type { AiAnalyticsParamCode } from '../params/registry.const';
import { AI_ANALYTICS_PARAM_DEFAULTS } from '../params/registry.const';
import { resolveNumberParam, resolveParam } from '../params/resolve';

/**
 * `resolveParam` идёт снизу вверх — менеджер важнее полосы стажа, полоса
 * важнее портала, портал важнее глобального дефолта; гибрид смешивает
 * настройку с данными по весу w. Ошибка настройки не должна молча портить
 * норму: значение вне диапазона откатывается к дефолту с причиной.
 */
describe('resolveParam: слои переопределения', () => {
    it('без контекста берёт глобальный дефолт реестра', () => {
        const resolved = resolveParam('forget_lambda');

        expect(resolved).toEqual({
            code: 'forget_lambda',
            value: 0.85,
            source: 'default',
        });
    });

    it('портал перебивает дефолт', () => {
        const resolved = resolveParam('min_workdays_month', {
            portal: { min_workdays_month: 10 },
        });

        expect(resolved.value).toBe(10);
        expect(resolved.source).toBe('portal');
        expect(resolved.reason).toBeUndefined();
    });

    it('полоса стажа перебивает портал', () => {
        const resolved = resolveParam('min_workdays_month', {
            portal: { min_workdays_month: 10 },
            tenureBand: { min_workdays_month: 9 },
        });

        expect(resolved.value).toBe(9);
        expect(resolved.source).toBe('tenure');
    });

    it('менеджер перебивает полосу стажа и портал', () => {
        const resolved = resolveParam('min_workdays_month', {
            portal: { min_workdays_month: 10 },
            tenureBand: { min_workdays_month: 9 },
            manager: { min_workdays_month: 6 },
        });

        expect(resolved.value).toBe(6);
        expect(resolved.source).toBe('manager');
    });

    it('чужие коды в слое не мешают', () => {
        const resolved = resolveParam('z_compare', {
            portal: { forget_lambda: 0.9 },
        });

        expect(resolved.value).toBe(1.645);
        expect(resolved.source).toBe('default');
    });

    it('строковый параметр берётся со слоя как есть', () => {
        const resolved = resolveParam('hot_client_colors', {
            portal: { hot_client_colors: 'green,yellow' },
        });

        expect(resolved.value).toBe('green,yellow');
        expect(resolved.source).toBe('portal');
    });
});

describe('resolveParam: валидация значений слоя', () => {
    it('значение выше диапазона откатывается к дефолту', () => {
        const resolved = resolveParam('forget_lambda', {
            portal: { forget_lambda: 1.4 },
        });

        expect(resolved.value).toBe(0.85);
        expect(resolved.source).toBe('default');
        expect(resolved.reason).toBe('out-of-range');
    });

    it('значение ниже диапазона откатывается к дефолту', () => {
        const resolved = resolveParam('n_min_none', {
            manager: { n_min_none: 1 },
        });

        expect(resolved.value).toBe(8);
        expect(resolved.reason).toBe('out-of-range');
    });

    it('значение верхнего слоя не проваливается на слой ниже', () => {
        const resolved = resolveParam('min_workdays_month', {
            portal: { min_workdays_month: 10 },
            manager: { min_workdays_month: 99 },
        });

        expect(resolved.value).toBe(8);
        expect(resolved.source).toBe('default');
        expect(resolved.reason).toBe('out-of-range');
    });

    it('неверный тип значения откатывается к дефолту', () => {
        const resolved = resolveParam('forget_lambda', {
            portal: { forget_lambda: '0.9' },
        });

        expect(resolved.value).toBe(0.85);
        expect(resolved.reason).toBe('type-mismatch');
    });

    it('NaN и объект в настройке не проходят', () => {
        expect(
            resolveParam('f_min', { portal: { f_min: Number.NaN } }).reason,
        ).toBe('out-of-range');
        expect(
            resolveParam('f_min', { portal: { f_min: { value: 0.2 } } }).reason,
        ).toBe('type-mismatch');
    });

    it('неизвестный код не бросает исключение', () => {
        const unknownCode =
            'нет_такого_кода' as unknown as AiAnalyticsParamCode;
        const resolved = resolveParam(unknownCode);

        expect(resolved.reason).toBe('unknown-code');
        expect(resolved.source).toBe('default');
    });
});

describe('resolveParam: словари строковых кодов (enum / csv / json)', () => {
    it('enum: значение не из словаря откатывается с invalid-value', () => {
        const ok = resolveParam('norm_stratum', {
            portal: { norm_stratum: 'level' },
        });
        const bad = resolveParam('norm_stratum', {
            portal: { norm_stratum: 'shoe-size' },
        });

        expect(ok.value).toBe('level');
        expect(ok.reason).toBeUndefined();
        expect(bad.value).toBe('tenure');
        expect(bad.source).toBe('default');
        expect(bad.reason).toBe('invalid-value');
    });

    it('csv: элементы из словаря, без дублей; пустая строка допустима', () => {
        expect(
            resolveParam('hot_client_colors', {
                portal: { hot_client_colors: 'green,yellow' },
            }).reason,
        ).toBeUndefined();
        expect(
            resolveParam('hot_client_colors', {
                portal: { hot_client_colors: 'green,purple' },
            }).reason,
        ).toBe('invalid-value');
        expect(
            resolveParam('funnel_edges', {
                portal: { funnel_edges: 'e1,e1' },
            }).reason,
        ).toBe('invalid-value');
        expect(
            resolveParam('funnel_edges', { portal: { funnel_edges: '' } })
                .reason,
        ).toBeUndefined();
        expect(
            resolveParam('decision_stages', {
                portal: { decision_stages: 'sales_new,sales_cold' },
            }).value,
        ).toBe('sales_new,sales_cold');
    });

    it('json: только объект или массив', () => {
        expect(
            resolveParam('holidays', {
                portal: { holidays: '["2026-11-04"]' },
            }).reason,
        ).toBeUndefined();
        expect(
            resolveParam('holidays', { portal: { holidays: 'not json' } })
                .reason,
        ).toBe('invalid-value');
        expect(
            resolveParam('holidays', { portal: { holidays: '5' } }).reason,
        ).toBe('invalid-value');
    });

    it('флаговый код: строка «true» — type-mismatch', () => {
        const resolved = resolveParam('roster_confirm_required', {
            portal: { roster_confirm_required: 'true' },
        });

        expect(resolved.value).toBe(false);
        expect(resolved.reason).toBe('type-mismatch');
    });
});

describe('resolveParam: гибриды', () => {
    it('смешивает настройку и данные по весу w', () => {
        const resolved = resolveParam(
            'cycle_median_days',
            {},
            { data: 40, w: 0.25, n: 7 },
        );

        expect(resolved.source).toBe('hybrid');
        expect(resolved.value).toBeCloseTo(31, 10);
        expect(resolved.prior).toBe(28);
        expect(resolved.data).toBe(40);
        expect(resolved.w).toBe(0.25);
        expect(resolved.n).toBe(7);
    });

    it('смешивает с прайором портала, а не с глобальным дефолтом', () => {
        const resolved = resolveParam(
            'kappa_activity_days',
            { portal: { kappa_activity_days: 40 } },
            { data: 60, w: 0.5 },
        );

        expect(resolved.value).toBeCloseTo(50, 10);
        expect(resolved.prior).toBe(40);
    });

    it('w = 0 даёт настройку, w = 1 — данные', () => {
        expect(
            resolveParam('cycle_median_days', {}, { data: 40, w: 0 }).value,
        ).toBeCloseTo(28, 10);
        expect(
            resolveParam('cycle_median_days', {}, { data: 40, w: 1 }).value,
        ).toBeCloseTo(40, 10);
    });

    it('оценка вне диапазона игнорируется', () => {
        const resolved = resolveParam(
            'cycle_median_days',
            {},
            { data: 900, w: 0.9 },
        );

        expect(resolved.value).toBe(28);
        expect(resolved.source).toBe('default');
        expect(resolved.reason).toBe('out-of-range');
    });

    it('вес вне [0; 1] игнорируется', () => {
        const resolved = resolveParam(
            'cycle_median_days',
            {},
            { data: 40, w: 1.5 },
        );

        expect(resolved.value).toBe(28);
        expect(resolved.source).toBe('default');
    });

    it('у настроек данные не смешиваются', () => {
        const resolved = resolveParam(
            'plan_day_ceiling',
            {},
            { data: 2.4, w: 1 },
        );

        expect(resolved.value).toBe(1.5);
        expect(resolved.source).toBe('default');
    });

    it('resolveNumberParam отдаёт число, для строковых кодов — undefined', () => {
        expect(resolveNumberParam('plan_day_ceiling')).toBe(1.5);
        expect(resolveNumberParam('hot_client_definition')).toBeUndefined();
    });
});

describe('paramsVersion: детерминизм', () => {
    const portalParams = { forget_lambda: 0.9, n_min_none: 8 };
    const managerParams = { alice: { fte_share: 0.5 } };

    it('не зависит от порядка ключей', () => {
        const first = paramsVersion({
            globalDefaults: { a: 1, b: 2 },
            portalParams,
            managerParams,
        });
        const second = paramsVersion({
            managerParams,
            portalParams: { n_min_none: 8, forget_lambda: 0.9 },
            globalDefaults: { b: 2, a: 1 },
        });

        expect(first).toBe(second);
        expect(first).toMatch(/^[0-9a-f]{64}$/);
    });

    it('повторный вызов на том же входе даёт тот же хэш', () => {
        const payload = { globalDefaults: AI_ANALYTICS_PARAM_DEFAULTS };

        expect(paramsVersion(payload)).toBe(paramsVersion(payload));
    });

    it('меняется при смене значения и при смене версии реестра', () => {
        const base = paramsVersion({ portalParams });
        const changed = paramsVersion({
            portalParams: { ...portalParams, forget_lambda: 0.91 },
        });
        const otherRegistry = paramsVersion({
            portalParams,
            registryVersion: 'sam-test',
        });

        expect(changed).not.toBe(base);
        expect(otherRegistry).not.toBe(base);
    });

    it('пустые слои эквивалентны отсутствующим', () => {
        expect(paramsVersion({ portalParams })).toBe(
            paramsVersion({
                globalDefaults: {},
                portalParams,
                tenureParams: {},
                managerParams: {},
                registryVersion: REGISTRY_VERSION,
            }),
        );
    });

    it('canonicalJson сортирует ключи и сохраняет порядок массивов', () => {
        expect(canonicalJson({ b: 1, a: [3, 1, 2], c: null })).toBe(
            '{"a":[3,1,2],"b":1,"c":null}',
        );
        expect(canonicalJson({ a: -0 })).toBe('{"a":0}');
        expect(canonicalJson({ a: Number.POSITIVE_INFINITY })).toBe(
            '{"a":null}',
        );
    });

    it('REGISTRY_VERSION — стабильный sha256 состава кодов', () => {
        expect(REGISTRY_VERSION).toMatch(/^[0-9a-f]{64}$/);
    });
});
