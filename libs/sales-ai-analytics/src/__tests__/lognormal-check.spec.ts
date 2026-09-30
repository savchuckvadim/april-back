import {
    LOGNORMAL_CHECK_DEFAULTS,
    LOGNORMAL_CHECK_M_RANGE,
    LOGNORMAL_CHECK_V_RANGE,
    estimateLognormalCheck,
    expectedCheck,
    moneyBand,
    sumOfChecksQuantile,
} from '../model/lognormal-check';
import { mulberry32, sampleNormal, seedOf } from '../model/prng';
import { registryDefault } from '../params/registry.access';
import { findParam } from '../params/registry.const';

/**
 * Логнормальный чек и вилка денег (план §4.8; Фаза 4, поток
 * `p4-forecast-model`): восстановление m, v на 500 суммах, дефолт до
 * гейта minN, усадка w = n/(n + κ), детерминированный Монте-Карло.
 */

/** Синтетические суммы продаж LogNormal(m, v) на потоке seed. */
function amountsOf(m: number, v: number, n: number, seed: number): number[] {
    const random = mulberry32(seed);
    const sigma = Math.sqrt(v);

    return Array.from({ length: n }, () =>
        Math.exp(m + sigma * sampleNormal(random)),
    );
}

const TRUE_M = 10.5;
const TRUE_V = 0.6;

describe('estimateLognormalCheck — дефолты из реестра', () => {
    it('прайоры, гейт и диапазоны — из дескрипторов check_lognormal_*', () => {
        expect(LOGNORMAL_CHECK_DEFAULTS.priorM).toBe(
            registryDefault('check_lognormal_m'),
        );
        expect(LOGNORMAL_CHECK_DEFAULTS.priorV).toBe(
            registryDefault('check_lognormal_v'),
        );
        expect(LOGNORMAL_CHECK_DEFAULTS.minN).toBe(
            findParam('check_lognormal_m')?.minN,
        );
        expect(LOGNORMAL_CHECK_DEFAULTS.minN).toBe(20);
        expect(LOGNORMAL_CHECK_DEFAULTS.kappa).toBe(20);
        expect(LOGNORMAL_CHECK_M_RANGE).toEqual(
            findParam('check_lognormal_m')?.range,
        );
        expect(LOGNORMAL_CHECK_V_RANGE).toEqual(
            findParam('check_lognormal_v')?.range,
        );
    });
});

describe('estimateLognormalCheck — оценка', () => {
    const amounts = amountsOf(TRUE_M, TRUE_V, 500, seedOf('check', 500));

    it('без усадки (κ = 0) восстанавливает m и v на 500 суммах', () => {
        const check = estimateLognormalCheck(amounts, { kappa: 0 });
        expect(check.source).toBe('estimated');
        expect(check.n).toBe(500);
        expect(check.w).toBe(1);
        expect(check.m).toBeCloseTo(TRUE_M, 1);
        expect(Math.abs(check.v - TRUE_V)).toBeLessThan(0.1);
    });

    it('с усадкой κ = 20: w = 500/520, оценка между данными и прайором', () => {
        const pure = estimateLognormalCheck(amounts, { kappa: 0 });
        const shrunk = estimateLognormalCheck(amounts);
        expect(shrunk.source).toBe('shrunk');
        expect(shrunk.w).toBeCloseTo(500 / 520, 12);
        expect(shrunk.m).toBeCloseTo(
            shrunk.w * pure.m +
                (1 - shrunk.w) * LOGNORMAL_CHECK_DEFAULTS.priorM,
            10,
        );
        expect(shrunk.v).toBeCloseTo(
            shrunk.w * pure.v +
                (1 - shrunk.w) * LOGNORMAL_CHECK_DEFAULTS.priorV,
            10,
        );
    });

    it('n < minN — дефолт реестра с w = 0, ни одного числа из данных', () => {
        const few = amounts.slice(0, 19);
        expect(estimateLognormalCheck(few)).toEqual({
            m: LOGNORMAL_CHECK_DEFAULTS.priorM,
            v: LOGNORMAL_CHECK_DEFAULTS.priorV,
            n: 19,
            w: 0,
            source: 'default',
        });
    });

    it('нулевые, отрицательные и NaN суммы не входят в n', () => {
        const check = estimateLognormalCheck([
            ...amounts.slice(0, 25),
            0,
            -5,
            Number.NaN,
        ]);
        expect(check.n).toBe(25);
    });

    it('оценка клипается в диапазон реестра', () => {
        const huge = Array.from({ length: 30 }, () => Math.exp(20));
        const check = estimateLognormalCheck(huge, { kappa: 0 });
        expect(check.m).toBe(LOGNORMAL_CHECK_M_RANGE[1]);
        expect(check.v).toBe(LOGNORMAL_CHECK_V_RANGE[0]);
    });

    it('детерминизм: два вызова → toEqual', () => {
        expect(estimateLognormalCheck(amounts)).toEqual(
            estimateLognormalCheck(amounts),
        );
    });
});

describe('moneyBand', () => {
    const seed = seedOf('money', 'band', 1);

    it('центр = p50 продаж × E[X], края упорядочены и симулируются по seed', () => {
        const band = moneyBand({
            salesBand: { low: 6, p50: 10, high: 14 },
            m: TRUE_M,
            v: TRUE_V,
            seed,
        });
        expect(band.p50).toBeCloseTo(10 * expectedCheck(TRUE_M, TRUE_V), 6);
        expect(band.low).toBeLessThan(band.p50);
        expect(band.high).toBeGreaterThan(band.p50);
        // Нижний край ниже ожидания 6 чеков, верхний — выше ожидания 14.
        expect(band.low).toBeLessThan(6 * expectedCheck(TRUE_M, TRUE_V));
        expect(band.high).toBeGreaterThan(14 * expectedCheck(TRUE_M, TRUE_V));
    });

    it('одинаковый seed → побитово одинаковая вилка; другой seed — иная', () => {
        const input = {
            salesBand: { low: 3, p50: 5, high: 8 },
            m: TRUE_M,
            v: TRUE_V,
            seed,
        };
        expect(moneyBand(input)).toEqual(moneyBand(input));
        const other = moneyBand({ ...input, seed: seed + 1 });
        expect(other.p50).toBe(moneyBand(input).p50);
        expect(other.low).not.toBe(moneyBand(input).low);
    });

    it('нулевая вилка продаж — нулевые деньги', () => {
        expect(
            moneyBand({
                salesBand: { low: 0, p50: 0, high: 0 },
                m: TRUE_M,
                v: TRUE_V,
                seed,
            }),
        ).toEqual({ low: 0, p50: 0, high: 0 });
    });

    it('квантиль суммы чеков растёт с q и с числом чеков; ЦПТ-ветвь согласована', () => {
        const q = (count: number, prob: number): number =>
            sumOfChecksQuantile(count, TRUE_M, TRUE_V, prob, mulberry32(seed));
        expect(q(5, 0.1)).toBeLessThan(q(5, 0.9));
        expect(q(5, 0.5)).toBeLessThan(q(20, 0.5));
        const clt = q(600, 0.5);
        expect(clt / (600 * expectedCheck(TRUE_M, TRUE_V))).toBeGreaterThan(
            0.95,
        );
        expect(clt / (600 * expectedCheck(TRUE_M, TRUE_V))).toBeLessThan(1.05);
    });
});
