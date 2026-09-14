import { gammaInterval } from '../model/gamma';
import { mulberry32, seedOf } from '../model/prng';
import { SHRINK_DEFAULTS, forgetSeries, shrinkRate } from '../model/shrink';
import { wilsonInterval } from '../model/wilson';

const PRIOR = { mu: 0.092, kappa: 30 };

describe('shrinkRate', () => {
    it('числа плана: μ = 0,092, κ = 30 → 4/15 = 0,150, w = 0,33', () => {
        const result = shrinkRate({ successes: 4, exposure: 15, prior: PRIOR });
        expect(result.value).toBeCloseTo(0.15, 3);
        expect(result.w).toBeCloseTo(1 / 3, 6);
        expect(result.n).toBe(15);
        expect(result.intervalKind).toBe('wilson');
    });

    it('числа плана: 0/18 → 0,0575 ≈ 0,058, w = 0,375', () => {
        const result = shrinkRate({ successes: 0, exposure: 18, prior: PRIOR });
        expect(result.value).toBeCloseTo(0.0575, 4);
        expect(Math.abs(result.value - 0.058)).toBeLessThan(0.001);
        expect(result.w).toBeCloseTo(0.375, 6);
    });

    it('формула (s + κμ)/(n + κ) едина для долей и интенсивностей', () => {
        const share = shrinkRate({ successes: 4, exposure: 15, prior: PRIOR });
        const rate = shrinkRate({
            successes: 4,
            exposure: 15,
            prior: PRIOR,
            intervalKind: 'gamma',
        });
        expect(rate.value).toBe(share.value);
        expect(rate.w).toBe(share.w);
        expect(rate.intervalKind).toBe('gamma');
    });

    it('Уилсон 90 % на псевдосчётчиках: накрывает оценку, уже интервала без прайора', () => {
        const result = shrinkRate({ successes: 4, exposure: 15, prior: PRIOR });
        const [lower, upper] = result.ci90 ?? [NaN, NaN];
        expect(lower).toBeLessThan(result.value);
        expect(upper).toBeGreaterThan(result.value);
        expect(result.ci90).toEqual(wilsonInterval(4 + 30 * 0.092, 45));
        const [rawLower, rawUpper] = wilsonInterval(4, 15);
        expect(upper - lower).toBeLessThan(rawUpper - rawLower);
    });

    it('гамма-интервал накрывает оценку и не уходит ниже нуля', () => {
        const result = shrinkRate({
            successes: 0,
            exposure: 18,
            prior: PRIOR,
            intervalKind: 'gamma',
        });
        const [lower, upper] = result.ci90 ?? [NaN, NaN];
        expect(lower).toBeGreaterThanOrEqual(0);
        expect(lower).toBeLessThan(result.value);
        expect(upper).toBeGreaterThan(result.value);
    });

    it('без данных и без прайора → μ, w = 0, интервала нет', () => {
        const result = shrinkRate({
            successes: 0,
            exposure: 0,
            prior: { mu: 0.2, kappa: 0 },
        });
        expect(result).toEqual({
            value: 0.2,
            w: 0,
            n: 0,
            prior: { mu: 0.2, kappa: 0 },
            intervalKind: 'wilson',
            ci90: null,
        });
    });

    it('w ∈ [0, 1] и растёт с экспозицией; отрицательные входы обрезаются', () => {
        const small = shrinkRate({ successes: 1, exposure: 5, prior: PRIOR });
        const large = shrinkRate({
            successes: 20,
            exposure: 100,
            prior: PRIOR,
        });
        expect(small.w).toBeGreaterThanOrEqual(0);
        expect(large.w).toBeLessThanOrEqual(1);
        expect(large.w).toBeGreaterThan(small.w);
        const clipped = shrinkRate({
            successes: -3,
            exposure: -10,
            prior: { mu: 0.1, kappa: -5 },
        });
        expect(clipped.n).toBe(0);
        expect(clipped.prior.kappa).toBe(0);
        expect(clipped.value).toBe(0.1);
    });
});

describe('forgetSeries', () => {
    const points = [
        { periodKey: '2026-07', n: 10, s: 1 },
        { periodKey: '2026-08', n: 20, s: 2 },
        { periodKey: '2026-09', n: 30, s: 3 },
    ];

    it('последний период весит 1, предыдущие — λ^k (λ = 0,85 по умолчанию)', () => {
        const result = forgetSeries(points);
        expect(result.lambda).toBe(SHRINK_DEFAULTS.forgetLambda);
        expect(result.n).toBeCloseTo(30 + 20 * 0.85 + 10 * 0.85 ** 2, 9);
        expect(result.s).toBeCloseTo(3 + 2 * 0.85 + 1 * 0.85 ** 2, 9);
        expect(result.periods).toBe(3);
        expect(result.latestPeriodKey).toBe('2026-09');
    });

    it('λ = 1 — обычные суммы; порядок входа не важен', () => {
        const direct = forgetSeries(points, 1);
        expect(direct.n).toBe(60);
        expect(direct.s).toBe(6);
        expect(forgetSeries([...points].reverse())).toEqual(
            forgetSeries(points),
        );
    });

    it('пустой ряд → нули; λ вне [0, 1] обрезается', () => {
        expect(forgetSeries([])).toEqual({
            n: 0,
            s: 0,
            periods: 0,
            lambda: SHRINK_DEFAULTS.forgetLambda,
            latestPeriodKey: null,
        });
        expect(forgetSeries(points, 2).lambda).toBe(1);
        expect(forgetSeries(points, -1).n).toBe(30);
    });

    it('усадка на ряде с забыванием даёт тот же результат, что на суммах', () => {
        const forgotten = forgetSeries(points);
        const shrunk = shrinkRate({
            successes: forgotten.s,
            exposure: forgotten.n,
            prior: PRIOR,
        });
        expect(shrunk.value).toBeCloseTo(
            (forgotten.s + 30 * 0.092) / (forgotten.n + 30),
            12,
        );
    });
});

describe('gammaInterval', () => {
    it('при большом shape совпадает с нормальным приближением', () => {
        const [lower, upper] = gammaInterval(400, 100) ?? [NaN, NaN];
        const sd = Math.sqrt(400) / 100;
        expect(lower).toBeCloseTo(4 - 1.645 * sd, 1);
        expect(upper).toBeCloseTo(4 + 1.645 * sd, 1);
    });

    it('Gamma(2,76; 48): интервал асимметричен вокруг среднего и положителен', () => {
        const [lower, upper] = gammaInterval(2.76, 48) ?? [NaN, NaN];
        const mean = 2.76 / 48;
        expect(lower).toBeGreaterThan(0);
        expect(lower).toBeLessThan(mean);
        expect(upper).toBeGreaterThan(mean);
        expect(upper - mean).toBeGreaterThan(mean - lower);
    });

    it('shape = 0 → [0, 0]; некорректный вход → null', () => {
        expect(gammaInterval(0, 10)).toEqual([0, 0]);
        expect(gammaInterval(-1, 10)).toBeNull();
        expect(gammaInterval(3, 0)).toBeNull();
        expect(gammaInterval(Number.NaN, 1)).toBeNull();
    });

    it('интервал сужается с ростом экспозиции при том же темпе', () => {
        const [l1, u1] = gammaInterval(5, 50) ?? [0, 0];
        const [l2, u2] = gammaInterval(50, 500) ?? [0, 0];
        expect(u2 - l2).toBeLessThan(u1 - l1);
    });
});

describe('property: w ∈ [0, 1] на 1000 случайных входов (mulberry32)', () => {
    const random = mulberry32(seedOf('shrink', 'w-property'));
    /** Равномерно в [−0,3·scale; 0,7·scale] — с отрицательной зоной. */
    const spread = (scale: number): number => (random() - 0.3) * scale;

    it('shrinkRate: w в [0, 1], value = w·(s/n) + (1 − w)·μ конечно', () => {
        for (let trial = 0; trial < 1000; trial += 1) {
            const successes = spread(200);
            const exposure = spread(500);
            const mu = random();
            const result = shrinkRate({
                successes,
                exposure,
                prior: { mu, kappa: spread(300) },
                intervalKind: random() < 0.5 ? 'wilson' : 'gamma',
            });
            expect(result.w).toBeGreaterThanOrEqual(0);
            expect(result.w).toBeLessThanOrEqual(1);
            expect(Number.isFinite(result.value)).toBe(true);
            if (result.n > 0) {
                const own = Math.max(0, successes) / result.n;
                expect(result.value).toBeCloseTo(
                    result.w * own + (1 - result.w) * mu,
                    9,
                );
            } else {
                // s при n = 0 — нарушение инварианта s ≤ n на стороне
                // вызывающего (§4.1 mixed-sources); здесь только w = 0.
                expect(result.w).toBe(0);
            }
        }
    });

    it('w не убывает с ростом экспозиции при той же κ', () => {
        for (let trial = 0; trial < 1000; trial += 1) {
            const kappa = spread(300);
            const smaller = spread(500);
            const larger = smaller + random() * 100;
            const prior = { mu: random(), kappa };
            const low = shrinkRate({ successes: 0, exposure: smaller, prior });
            const high = shrinkRate({ successes: 0, exposure: larger, prior });
            expect(high.w).toBeGreaterThanOrEqual(low.w);
        }
    });

    it('forgetSeries + shrinkRate: w в [0, 1] при любых λ и знаках точек', () => {
        for (let trial = 0; trial < 1000; trial += 1) {
            const length = Math.floor(random() * 5);
            const points = Array.from({ length }, (_, index) => ({
                periodKey: `2026-0${index + 1}`,
                n: spread(40),
                s: spread(200),
            }));
            const forgotten = forgetSeries(points, spread(3));
            const result = shrinkRate({
                successes: forgotten.s,
                exposure: forgotten.n,
                prior: { mu: random(), kappa: spread(100) },
            });
            expect(forgotten.n).toBeGreaterThanOrEqual(0);
            expect(result.w).toBeGreaterThanOrEqual(0);
            expect(result.w).toBeLessThanOrEqual(1);
        }
    });
});
