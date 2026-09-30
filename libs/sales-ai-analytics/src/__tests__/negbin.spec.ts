import {
    NEGBIN_DEFAULTS,
    NEGBIN_MAX_STEPS,
    negBinCdf,
    negBinInterval,
    negBinPmf,
    negBinQuantile,
    sampleNegBin,
} from '../model/negbin';
import { mulberry32, seedOf } from '../model/prng';
import { registryDefault } from '../params/registry.access';

/**
 * NegBin(μ, φ) с квазипуассоновской сверхдисперсией (план §4.8; Фаза 4,
 * поток `p4-forecast-model`): при φ = 1 — Пуассон с известными
 * квантилями, при φ > 1 интервал шире, pmf суммируется в единицу.
 */
describe('negbin — дефолты из реестра', () => {
    it('φ и уровень вилки берутся из реестра, не литералами', () => {
        expect(NEGBIN_DEFAULTS.phi).toBe(
            registryDefault('overdispersion_default'),
        );
        expect(NEGBIN_DEFAULTS.level).toBe(
            registryDefault('forecast_interval_level'),
        );
        expect(NEGBIN_DEFAULTS.level).toBe(0.8);
    });
});

describe('negbin — Пуассон при φ = 1', () => {
    it('квантили Пуассона(10): P10 = 6, P50 = 10, P90 = 14', () => {
        expect(negBinQuantile(10, 1, 0.1)).toBe(6);
        expect(negBinQuantile(10, 1, 0.5)).toBe(10);
        expect(negBinQuantile(10, 1, 0.9)).toBe(14);
    });

    it('cdf Пуассона(5) в точке 8 ≈ 0,9319, pmf(5) ≈ 0,1755', () => {
        expect(negBinCdf(8, 5, 1)).toBeCloseTo(0.9319, 4);
        expect(negBinPmf(5, 5, 1)).toBeCloseTo(0.1755, 4);
    });

    it('φ < 1 трактуется как Пуассон', () => {
        expect(negBinQuantile(10, 0.3, 0.9)).toBe(14);
        expect(negBinPmf(3, 4, 0.5)).toBeCloseTo(negBinPmf(3, 4, 1), 12);
    });
});

describe('negbin — сверхдисперсия', () => {
    it('pmf суммируется в единицу при φ = 3 и φ = 6', () => {
        for (const phi of [1, 3, 6]) {
            let total = 0;
            for (let k = 0; k <= 400; k += 1) {
                total += negBinPmf(k, 20, phi);
            }
            expect(total).toBeCloseTo(1, 8);
        }
    });

    it('дисперсия NegBin(μ = 20, φ = 3) ≈ φ·μ = 60', () => {
        let mean = 0;
        let second = 0;
        for (let k = 0; k <= 600; k += 1) {
            const p = negBinPmf(k, 20, 3);
            mean += k * p;
            second += k * k * p;
        }
        expect(mean).toBeCloseTo(20, 6);
        expect(second - mean * mean).toBeCloseTo(60, 5);
    });

    it('интервал при φ = 3 шире, чем при φ = 1, и упорядочен', () => {
        const poisson = negBinInterval(20, 1, 0.8);
        const wide = negBinInterval(20, 3, 0.8);
        expect(poisson.low).toBeLessThanOrEqual(poisson.high);
        expect(wide.high - wide.low).toBeGreaterThan(
            poisson.high - poisson.low,
        );
        expect(wide.low).toBeLessThanOrEqual(poisson.low);
        expect(wide.high).toBeGreaterThanOrEqual(poisson.high);
    });

    it('центральный интервал накрывает не меньше level по cdf: F(high) − F(low − 1) ≥ level', () => {
        for (const mu of [0.3, 2, 7.5, 20, 60]) {
            for (const phi of [1, 1.5, 2.5, 6]) {
                const { low, high } = negBinInterval(mu, phi, 0.8);
                const mass =
                    negBinCdf(high, mu, phi) - negBinCdf(low - 1, mu, phi);
                expect(mass).toBeGreaterThanOrEqual(0.8 - 1e-9);
                // Квантили — наименьшие k: шаг влево/вправо ломает уровень хвоста.
                expect(negBinCdf(high - 1, mu, phi)).toBeLessThan(0.9);
                expect(negBinCdf(low, mu, phi)).toBeGreaterThanOrEqual(0.1);
            }
        }
    });

    it('квантиль не убывает по prob', () => {
        let previous = 0;
        for (let step = 1; step <= 99; step += 1) {
            const value = negBinQuantile(15, 2.5, step / 100);
            expect(value).toBeGreaterThanOrEqual(previous);
            previous = value;
        }
    });

    it('cdf монотонна и не превышает единицы', () => {
        let previous = 0;
        for (let k = 0; k <= 200; k += 1) {
            const value = negBinCdf(k, 15, 2.5);
            expect(value).toBeGreaterThanOrEqual(previous);
            expect(value).toBeLessThanOrEqual(1);
            previous = value;
        }
        expect(previous).toBeCloseTo(1, 6);
    });

    it('большое μ не обнуляет pmf (рекурсия в логарифмах)', () => {
        expect(negBinQuantile(5000, 2.5, 0.5)).toBeGreaterThan(4900);
        expect(negBinQuantile(5000, 2.5, 0.5)).toBeLessThan(5100);
        expect(negBinCdf(6000, 5000, 2.5)).toBeGreaterThan(0.99);
    });
});

describe('negbin — вырожденные входы и защита по шагам', () => {
    it('μ = 0 — вся масса в нуле', () => {
        expect(negBinQuantile(0, 2.5, 0.99)).toBe(0);
        expect(negBinInterval(0, 2.5, 0.8)).toEqual({ low: 0, high: 0 });
        expect(negBinPmf(0, 0, 2.5)).toBe(1);
        expect(negBinPmf(1, 0, 2.5)).toBe(0);
    });

    it('prob ≤ 0 → 0, prob = 1 не зацикливается и не выходит за лимит', () => {
        expect(negBinQuantile(10, 2.5, 0)).toBe(0);
        expect(negBinQuantile(10, 2.5, 1)).toBeLessThanOrEqual(
            NEGBIN_MAX_STEPS,
        );
        expect(negBinQuantile(10, 2.5, 1)).toBeGreaterThan(10);
    });

    it('нецелое или отрицательное k → pmf 0, cdf 0', () => {
        expect(negBinPmf(2.5, 10, 2)).toBe(0);
        expect(negBinPmf(-1, 10, 2)).toBe(0);
        expect(negBinCdf(-1, 10, 2)).toBe(0);
    });

    it('NaN в параметрах не ломает расчёт', () => {
        expect(negBinInterval(Number.NaN, Number.NaN, Number.NaN)).toEqual({
            low: 0,
            high: 0,
        });
    });
});

describe('negbin — выборка по seed', () => {
    it('sampleNegBin детерминирован и воспроизводит среднее и дисперсию', () => {
        const draw = (): number[] => {
            const random = mulberry32(seedOf('negbin', 'sample', 1));
            return Array.from({ length: 4000 }, () =>
                sampleNegBin(12, 2.5, random),
            );
        };
        const first = draw();
        expect(draw()).toEqual(first);
        const mean =
            first.reduce((sum, value) => sum + value, 0) / first.length;
        const variance =
            first.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
            first.length;
        expect(mean).toBeCloseTo(12, 0);
        expect(variance / mean).toBeGreaterThan(2);
        expect(variance / mean).toBeLessThan(3);
    });
});
