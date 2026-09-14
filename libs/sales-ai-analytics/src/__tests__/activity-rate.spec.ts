import {
    ActivityRateInput,
    ActivitySeriesPoint,
    forgetWithGaps,
    resolveActivityPhi,
    shrinkActivityRate,
} from '../model/activity-rate';
import { KAPPA_DEFAULTS } from '../model/kappa';
import { DISPERSION_DEFAULTS, quasiPoissonPhi } from '../model/overdispersion';
import { mulberry32, sampleGamma, seedOf } from '../model/prng';
import { SHRINK_DEFAULTS, forgetSeries, shrinkRate } from '../model/shrink';
import { sampleOverdispersedCount } from './rate-synthetic.fixture';

const LAMBDA = SHRINK_DEFAULTS.forgetLambda;
const PRIOR = { mu: 6, kappa: KAPPA_DEFAULTS.activityDays };

const point = (periodKey: string, n: number, s: number) => ({
    periodKey,
    n,
    s,
});

const width = (ci: [number, number] | null): number =>
    ci ? ci[1] - ci[0] : Number.NaN;

describe('forgetWithGaps', () => {
    const january = point('2026-01', 20, 100);
    const february = point('2026-02', 20, 120);
    const march = point('2026-03', 18, 90);
    const april = point('2026-04', 21, 130);

    it('пропуск марта не меняет вес января (λ³) и февраля (λ²) — как в полном ряде', () => {
        const full = forgetSeries([january, february, march, april], LAMBDA);
        const gapped = forgetWithGaps([january, february, april], LAMBDA, [
            '2026-03',
        ]);
        expect(gapped.n).toBeCloseTo(full.n - LAMBDA * march.n, 9);
        expect(gapped.s).toBeCloseTo(full.s - LAMBDA * march.s, 9);
        expect(gapped.n).toBeCloseTo(
            21 + LAMBDA ** 2 * 20 + LAMBDA ** 3 * 20,
            9,
        );
        expect(gapped.gaps).toBe(1);
        expect(gapped.periods).toBe(3);
        expect(gapped.latestPeriodKey).toBe('2026-04');
        expect(gapped.lambda).toBe(LAMBDA);
    });

    it('без ключа пропуска история сжимается: февраль весил бы λ вместо λ²', () => {
        const compressed = forgetSeries([january, february, april], LAMBDA);
        const gapped = forgetWithGaps([january, february, april], LAMBDA, [
            '2026-03',
        ]);
        expect(compressed.n).toBeCloseTo(
            21 + LAMBDA * 20 + LAMBDA ** 2 * 20,
            9,
        );
        expect(gapped.n).toBeLessThan(compressed.n);
        expect(gapped.s).toBeLessThan(compressed.s);
    });

    it('пропуск последнего периода окна снижает вес всех данных в λ раз', () => {
        const plain = forgetSeries([january, february, march], LAMBDA);
        const trailing = forgetWithGaps([january, february, march], LAMBDA, [
            '2026-04',
        ]);
        expect(trailing.n).toBeCloseTo(LAMBDA * plain.n, 9);
        expect(trailing.s).toBeCloseTo(LAMBDA * plain.s, 9);
        expect(trailing.latestPeriodKey).toBe('2026-04');
        expect(trailing.periods).toBe(3);
    });

    it('ключи, уже присутствующие в ряде, повторы и пустой список ничего не меняют', () => {
        const base = forgetSeries([january, february], LAMBDA);
        const same = forgetWithGaps([january, february], LAMBDA, [
            '2026-01',
            '2026-02',
            '2026-02',
            '2026-01',
        ]);
        expect(same).toEqual({ ...base, periods: 2, gaps: 0 });
        expect(forgetWithGaps([january, february])).toEqual({
            ...base,
            periods: 2,
            gaps: 0,
        });
    });

    it('λ = 1 — простые суммы, пропуски их не меняют', () => {
        const result = forgetWithGaps([january, april], 1, [
            '2026-02',
            '2026-03',
        ]);
        expect(result.n).toBe(41);
        expect(result.s).toBe(230);
        expect(result.gaps).toBe(2);
    });

    it('пустой ряд с одними пропусками — нули и ключ последнего пропуска', () => {
        const result = forgetWithGaps([], LAMBDA, ['2026-05', '2026-06']);
        expect(result.n).toBe(0);
        expect(result.s).toBe(0);
        expect(result.periods).toBe(0);
        expect(result.gaps).toBe(2);
        expect(result.latestPeriodKey).toBe('2026-06');
    });
});

describe('resolveActivityPhi', () => {
    it('без φ — дефолт реестра overdispersion_default', () => {
        expect(resolveActivityPhi(undefined)).toEqual({
            phi: DISPERSION_DEFAULTS.fallback,
            source: 'default',
        });
    });

    it('число — explicit, оценка — её собственный источник', () => {
        expect(resolveActivityPhi(1.7)).toEqual({
            phi: 1.7,
            source: 'explicit',
        });
        expect(resolveActivityPhi({ phi: 3.2, source: 'estimated' })).toEqual({
            phi: 3.2,
            source: 'estimated',
        });
        expect(resolveActivityPhi({ phi: 2.5, source: 'default' })).toEqual({
            phi: 2.5,
            source: 'default',
        });
    });

    it('ноль, отрицательное, NaN и оценка с некорректной φ → дефолт', () => {
        const fallback = {
            phi: DISPERSION_DEFAULTS.fallback,
            source: 'default',
        };
        expect(resolveActivityPhi(0)).toEqual(fallback);
        expect(resolveActivityPhi(-2)).toEqual(fallback);
        expect(resolveActivityPhi(Number.NaN)).toEqual(fallback);
        expect(resolveActivityPhi({ phi: 0, source: 'estimated' })).toEqual(
            fallback,
        );
    });
});

describe('shrinkActivityRate', () => {
    const series: ActivitySeriesPoint[] = [
        { periodKey: '2026-01', events: 100, days: 20 },
        { periodKey: '2026-02', events: 120, days: 20 },
        { periodKey: '2026-03', events: 140, days: 20 },
    ];

    it('φ = 1: совпадает с shrinkRate на суммах с забыванием', () => {
        const forgotten = forgetSeries(
            series.map(p => point(p.periodKey, p.days, p.events)),
            LAMBDA,
        );
        const expected = shrinkRate({
            successes: forgotten.s,
            exposure: forgotten.n,
            prior: PRIOR,
            intervalKind: 'gamma',
        });
        const result = shrinkActivityRate({ series, prior: PRIOR, phi: 1 });
        expect(result.value).toBeCloseTo(expected.value, 12);
        expect(result.w).toBeCloseTo(expected.w, 12);
        expect(result.ci90).toEqual(expected.ci90);
        expect(result.forgottenEvents).toBeCloseTo(forgotten.s, 12);
        expect(result.forgottenDays).toBeCloseTo(forgotten.n, 12);
        expect(result.phiSource).toBe('explicit');
        expect(result.periods).toBe(3);
        expect(result.gaps).toBe(0);
    });

    it('E[a] = (Ñ/φ + κμ)/(D̃/φ + κ), w = (D̃/φ)/(D̃/φ + κ), интервал гамма', () => {
        const result = shrinkActivityRate({
            series: [{ periodKey: '2026-03', events: 150, days: 20 }],
            prior: { mu: 6, kappa: 20 },
            phi: 2.5,
        });
        expect(result.value).toBeCloseTo(
            (150 / 2.5 + 20 * 6) / (20 / 2.5 + 20),
            12,
        );
        expect(result.w).toBeCloseTo(8 / 28, 12);
        expect(result.intervalKind).toBe('gamma');
        expect(result.phi).toBe(2.5);
        const [low, high] = result.ci90 ?? [Number.NaN, Number.NaN];
        expect(low).toBeGreaterThan(0);
        expect(low).toBeLessThan(result.value);
        expect(high).toBeGreaterThan(result.value);
    });

    it('φ увеличивает интервал и снижает вес собственных данных', () => {
        const at = (phi: number) =>
            shrinkActivityRate({ series, prior: PRIOR, phi });
        const pure = at(1);
        const moderate = at(2.5);
        const heavy = at(4);
        expect(width(moderate.ci90)).toBeGreaterThan(width(pure.ci90));
        expect(width(heavy.ci90)).toBeGreaterThan(width(moderate.ci90));
        expect(moderate.w).toBeLessThan(pure.w);
        expect(heavy.w).toBeLessThan(moderate.w);
    });

    it('φ из оценки quasiPoissonPhi: результат несёт φ и источник estimated', () => {
        const random = mulberry32(seedOf('activity-rate', 'phi-estimate'));
        const weeks = Array.from({ length: 30 }, () => ({
            count: sampleOverdispersedCount(30, 3, random),
            exposure: 5,
        }));
        const estimate = quasiPoissonPhi(weeks);
        expect(estimate.source).toBe('estimated');
        const result = shrinkActivityRate({
            series,
            prior: PRIOR,
            phi: estimate,
        });
        expect(result.phi).toBe(estimate.phi);
        expect(result.phiSource).toBe('estimated');
        expect(result.value).toBeCloseTo(
            shrinkActivityRate({ series, prior: PRIOR, phi: estimate.phi })
                .value,
            12,
        );
    });

    it('без φ — дефолт реестра с источником default', () => {
        const result = shrinkActivityRate({ series, prior: PRIOR });
        expect(result.phi).toBe(DISPERSION_DEFAULTS.fallback);
        expect(result.phiSource).toBe('default');
        expect(result.lambda).toBe(LAMBDA);
    });

    it('пропущенный период подаётся нулём и снижает Ñ и D̃', () => {
        const sparse = series.filter(p => p.periodKey !== '2026-02');
        const compressed = shrinkActivityRate({ series: sparse, prior: PRIOR });
        const gapped = shrinkActivityRate({
            series: sparse,
            prior: PRIOR,
            gaps: ['2026-02'],
        });
        expect(gapped.gaps).toBe(1);
        expect(gapped.periods).toBe(2);
        expect(gapped.forgottenEvents).toBeLessThan(compressed.forgottenEvents);
        expect(gapped.forgottenDays).toBeLessThan(compressed.forgottenDays);
        expect(gapped.forgottenDays).toBeCloseTo(20 + LAMBDA ** 2 * 20, 9);
        expect(gapped.w).toBeLessThan(compressed.w);
    });

    it('значение — выпуклая комбинация собственного темпа Ñ/D̃ и нормы μ', () => {
        const result = shrinkActivityRate({ series, prior: PRIOR, phi: 2.5 });
        const own = result.forgottenEvents / result.forgottenDays;
        expect(result.value).toBeCloseTo(
            result.w * own + (1 - result.w) * PRIOR.mu,
            12,
        );
    });

    it('отрицательные события и дни обрезаются к нулю', () => {
        const result = shrinkActivityRate({
            series: [{ periodKey: '2026-03', events: -5, days: -3 }],
            prior: PRIOR,
        });
        expect(result.forgottenEvents).toBe(0);
        expect(result.forgottenDays).toBe(0);
        expect(result.value).toBe(PRIOR.mu);
        expect(result.w).toBe(0);
    });
});

describe('property: w ∈ [0, 1] на 1000 случайных входов (mulberry32)', () => {
    const random = mulberry32(seedOf('activity-rate', 'w-property'));
    /** Равномерно в [−0,3·scale; 0,7·scale] — с отрицательной зоной. */
    const spread = (scale: number): number => (random() - 0.3) * scale;
    const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];

    function randomInput(): ActivityRateInput {
        const length = Math.floor(random() * 6);
        const series = Array.from({ length }, (_, index) => ({
            periodKey: MONTHS[index % MONTHS.length],
            events: spread(300),
            days: spread(30),
        }));
        const phiChoice = random();
        const phi =
            phiChoice < 0.3
                ? undefined
                : phiChoice < 0.6
                  ? spread(8)
                  : { phi: spread(8), source: 'estimated' as const };
        return {
            series,
            prior: { mu: random() * 10, kappa: spread(100) },
            phi,
            lambda: random() < 0.8 ? random() : spread(3),
            gaps:
                random() < 0.5
                    ? MONTHS.slice(0, Math.floor(random() * 6))
                    : undefined,
        };
    }

    it('w в [0, 1], φ > 0, значение конечно и лежит между Ñ/D̃ и μ', () => {
        for (let trial = 0; trial < 1000; trial += 1) {
            const input = randomInput();
            const result = shrinkActivityRate(input);
            expect(result.w).toBeGreaterThanOrEqual(0);
            expect(result.w).toBeLessThanOrEqual(1);
            expect(result.phi).toBeGreaterThan(0);
            expect(Number.isFinite(result.value)).toBe(true);
            if (result.forgottenDays > 0) {
                const own = result.forgottenEvents / result.forgottenDays;
                expect(result.value).toBeCloseTo(
                    result.w * own + (1 - result.w) * input.prior.mu,
                    9,
                );
            } else {
                // События без дней экспозиции — нарушение инварианта на
                // стороне вызывающего; здесь только w = 0.
                expect(result.w).toBe(0);
            }
            expect(result.lambda).toBeGreaterThanOrEqual(0);
            expect(result.lambda).toBeLessThanOrEqual(1);
        }
    });
});

describe('восстановление a_mk на синтетике: 200 менеджер-месяцев, seed фиксирован', () => {
    const CELLS = 200;
    const DAYS = 20;

    interface Recovery {
        bias: number;
        rmseShrunk: number;
        rmseRaw: number;
    }

    /** Истинный темп a ~ Gamma(κμ, κ), три месяца счётов с заданной φ. */
    function recover(phi: number, seed: number): Recovery {
        const random = mulberry32(seed);
        let bias = 0;
        let sqShrunk = 0;
        let sqRaw = 0;
        for (let cell = 0; cell < CELLS; cell += 1) {
            const rate =
                sampleGamma(PRIOR.kappa * PRIOR.mu, random) / PRIOR.kappa;
            const cellSeries = ['2026-01', '2026-02', '2026-03'].map(
                periodKey => ({
                    periodKey,
                    days: DAYS,
                    events: sampleOverdispersedCount(rate * DAYS, phi, random),
                }),
            );
            const result = shrinkActivityRate({
                series: cellSeries,
                prior: PRIOR,
                phi,
            });
            const raw = result.forgottenEvents / result.forgottenDays;
            bias += result.value - rate;
            sqShrunk += (result.value - rate) ** 2;
            sqRaw += (raw - rate) ** 2;
        }
        return {
            bias: bias / CELLS,
            rmseShrunk: Math.sqrt(sqShrunk / CELLS),
            rmseRaw: Math.sqrt(sqRaw / CELLS),
        };
    }

    it.each([
        ['Пуассон', 1],
        ['NegBin φ = 2,5', 2.5],
    ])('%s: усадка без смещения и точнее сырого темпа', (_label, phi) => {
        const result = recover(phi, seedOf('recovery', phi));
        expect(Math.abs(result.bias)).toBeLessThan(0.15);
        expect(result.rmseShrunk).toBeLessThan(result.rmseRaw);
        expect(result.rmseShrunk).toBeLessThan(0.6);
    });
});
