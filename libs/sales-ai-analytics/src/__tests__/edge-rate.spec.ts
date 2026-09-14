import { shrinkActivityRate } from '../model/activity-rate';
import {
    EDGE_GAP_PRACTICAL,
    EDGE_RATE_DEFAULTS,
    activityPosterior,
    edgeGap,
    edgePosterior,
    gammaRatioInterval,
    newcombeDifference,
    practicalDeltaFromPct,
} from '../model/edge-rate';
import {
    DISPERSION_DEFAULTS,
    OVERDISPERSION_PARAM_CODE,
    quasiPoissonPhi,
} from '../model/overdispersion';
import { mulberry32, seedOf } from '../model/prng';
import { findParam } from '../params/registry.const';
import { resolveNumberParam } from '../params/resolve';
import { wilsonInterval } from '../model/wilson';
import { sampleOverdispersedCount } from './rate-synthetic.fixture';

/** Норма полосы и сила усадки из иллюстрации плана §4.2. */
const PRIOR = { mu: 0.09, kappa: 30 };

describe('edgePosterior — числа плана §4.2', () => {
    it('μ = 0,09, κ = 30, менеджер 4/15 → (4 + 2,7)/45 = 0,149, w = 0,33', () => {
        const result = edgePosterior({
            successes: 4,
            exposure: 15,
            prior: PRIOR,
        });
        expect(result.value).toBeCloseTo(6.7 / 45, 12);
        expect(result.value).toBeCloseTo(0.149, 3);
        expect(result.w).toBeCloseTo(0.33, 2);
        expect(result.intervalKind).toBe('wilson');
    });

    it('0/18 → 2,7/48 = 0,056, w = 0,38', () => {
        const result = edgePosterior({
            successes: 0,
            exposure: 18,
            prior: PRIOR,
        });
        expect(result.value).toBeCloseTo(0.05625, 9);
        expect(result.value).toBeCloseTo(0.056, 3);
        expect(result.w).toBeCloseTo(0.375, 9);
        expect(Math.round(result.w * 100) / 100).toBe(0.38);
        // Интервал — Уилсон на псевдосчётчиках Beta(s + κμ, n − s + κ(1 − μ)).
        const [expectedLow, expectedHigh] = wilsonInterval(2.7, 48);
        const [low, high] = result.ci90 ?? [NaN, NaN];
        expect(low).toBeCloseTo(expectedLow, 12);
        expect(high).toBeCloseTo(expectedHigh, 12);
    });
});

describe('activityPosterior — темпы с φ и забыванием λ', () => {
    it('Ñ и D̃ взвешены λ^(T−t), λ = 0,85', () => {
        const result = activityPosterior({
            series: [
                { periodKey: '2026-01', events: 100, days: 20 },
                { periodKey: '2026-02', events: 120, days: 20 },
                { periodKey: '2026-03', events: 140, days: 20 },
            ],
            prior: { mu: 6, kappa: EDGE_RATE_DEFAULTS.kappaActivity },
        });
        expect(result.lambda).toBe(0.85);
        expect(result.phi).toBe(2.5);
        expect(result.forgottenEvents).toBeCloseTo(
            140 + 0.85 * 120 + 0.85 * 0.85 * 100,
            9,
        );
        expect(result.forgottenDays).toBeCloseTo(20 * (1 + 0.85 + 0.7225), 9);
        expect(result.periods).toBe(3);
    });

    it('E[a] = (Ñ/φ + κ_a·μ)/(D̃/φ + κ_a), интервал — гамма', () => {
        const result = activityPosterior({
            series: [{ periodKey: '2026-03', events: 150, days: 20 }],
            prior: { mu: 6, kappa: 20 },
            phi: 2.5,
        });
        expect(result.value).toBeCloseTo(
            (150 / 2.5 + 20 * 6) / (20 / 2.5 + 20),
            9,
        );
        expect(result.w).toBeCloseTo(8 / 28, 9);
        expect(result.intervalKind).toBe('gamma');
        const [low, high] = result.ci90 ?? [NaN, NaN];
        expect(low).toBeGreaterThan(0);
        expect(low).toBeLessThan(result.value);
        expect(high).toBeGreaterThan(result.value);
    });

    it('φ = 2,5 расширяет интервал по сравнению с чистым Пуассоном', () => {
        const series = [{ periodKey: '2026-03', events: 150, days: 20 }];
        const prior = { mu: 6, kappa: 20 };
        const over = activityPosterior({ series, prior, phi: 2.5 });
        const pure = activityPosterior({ series, prior, phi: 1 });
        const width = (ci: [number, number] | null): number =>
            ci ? ci[1] - ci[0] : NaN;
        expect(width(over.ci90)).toBeGreaterThan(width(pure.ci90));
    });
});

describe('единицы практического порога', () => {
    it('delta_prac_pct реестра (п.п.) переводится в долю EDGE_GAP_PRACTICAL', () => {
        const pct = resolveNumberParam('delta_prac_pct');

        expect(pct).toBe(5);
        expect(practicalDeltaFromPct(pct ?? 0)).toBeCloseTo(
            EDGE_GAP_PRACTICAL.prob,
            12,
        );
        expect(resolveNumberParam('delta_prac_score')).toBe(
            EDGE_GAP_PRACTICAL.score,
        );
    });

    it('порог из реестра без конверсии обнулил бы разрыв', () => {
        const raw = edgeGap({
            kind: 'prob',
            manager: { successes: 4, exposure: 120 },
            reference: { successes: 260, exposure: 1300 },
            practicalDelta: resolveNumberParam('delta_prac_pct'),
        });
        const converted = edgeGap({
            kind: 'prob',
            manager: { successes: 4, exposure: 120 },
            reference: { successes: 260, exposure: 1300 },
            practicalDelta: practicalDeltaFromPct(
                resolveNumberParam('delta_prac_pct') ?? 0,
            ),
        });

        expect(raw.significant).toBe(false);
        expect(converted.significant).toBe(true);
    });
});

describe('newcombeDifference / edgeGap', () => {
    it('4/35 против LOO 12/130: 90 % накрывает ноль — разрыва нет', () => {
        const ci = newcombeDifference(
            { successes: 4, exposure: 35 },
            { successes: 12, exposure: 130 },
        );
        expect(ci).not.toBeNull();
        const [low, high] = ci ?? [NaN, NaN];
        expect(low).toBeCloseTo(-0.0579, 3);
        expect(high).toBeCloseTo(0.1441, 3);
        expect(low).toBeLessThan(0);
        expect(high).toBeGreaterThan(0);

        const gap = edgeGap({
            kind: 'prob',
            manager: { successes: 4, exposure: 35 },
            reference: { successes: 12, exposure: 130 },
        });
        expect(gap.coversZero).toBe(true);
        expect(gap.significant).toBe(false);
        expect(gap.direction).toBe('none');
        expect(gap.practicalDelta).toBe(EDGE_GAP_PRACTICAL.prob);
    });

    it('двухвыборочный интервал шире одновыборочного Уилсона', () => {
        const [low, high] = newcombeDifference(
            { successes: 4, exposure: 35 },
            { successes: 12, exposure: 130 },
        ) ?? [NaN, NaN];
        const [wLow, wHigh] = wilsonInterval(4, 35);
        expect(high - low).toBeGreaterThan(wHigh - wLow);
    });

    it('явный разрыв: интервал не накрывает ноль и |Δ| ≥ 5 п.п.', () => {
        const gap = edgeGap({
            kind: 'prob',
            manager: { successes: 4, exposure: 120 },
            reference: { successes: 260, exposure: 1300 },
        });
        expect(gap.coversZero).toBe(false);
        expect(gap.significant).toBe(true);
        expect(gap.direction).toBe('below');
        expect(gap.delta).toBeCloseTo(4 / 120 - 0.2, 9);
    });

    it('интервал не накрывает ноль, но |Δ| < порога — разрыв не показывается', () => {
        const gap = edgeGap({
            kind: 'prob',
            manager: { successes: 460, exposure: 2000 },
            reference: { successes: 4000, exposure: 20000 },
        });
        expect(gap.coversZero).toBe(false);
        expect(Math.abs(gap.delta)).toBeLessThan(EDGE_GAP_PRACTICAL.prob);
        expect(gap.significant).toBe(false);
        expect(gap.direction).toBe('none');
    });

    it('порог 1 балл для оценок задаётся practicalDelta', () => {
        expect(EDGE_GAP_PRACTICAL.score).toBe(1);
        const gap = edgeGap({
            kind: 'rate',
            manager: { successes: 100, exposure: 20 },
            reference: { successes: 1400, exposure: 200 },
            practicalDelta: EDGE_GAP_PRACTICAL.score,
        });
        expect(gap.delta).toBeCloseTo(-2, 9);
        expect(gap.ratioCi90).not.toBeNull();
        expect(gap.coversZero).toBe(false);
        expect(gap.significant).toBe(true);
        expect(gap.direction).toBe('below');
    });

    it('интенсивности: интервал отношения двух гамм вокруг θ_m/μ', () => {
        const ratio = gammaRatioInterval(
            { successes: 100, exposure: 20 },
            { successes: 1400, exposure: 200 },
        );
        const [low, high] = ratio ?? [NaN, NaN];
        expect(low).toBeLessThan(5 / 7);
        expect(high).toBeGreaterThan(5 / 7);
        expect(high).toBeLessThan(1);
    });

    it('пустой знаменатель: сравнение невозможно, разрыва нет', () => {
        const gap = edgeGap({
            kind: 'prob',
            manager: { successes: 0, exposure: 0 },
            reference: { successes: 12, exposure: 130 },
        });
        expect(gap.ci90).toBeNull();
        expect(gap.coversZero).toBe(true);
        expect(gap.significant).toBe(false);
        expect(
            gammaRatioInterval(
                { successes: 0, exposure: 10 },
                { successes: 5, exposure: 10 },
            ),
        ).toBeNull();
    });
});

/**
 * Покрытие 90 %-интервалов на синтетике (500 ячеек, фильтр κμ ≥ 2, NegBin
 * через гамма-смесь) — в posterior-coverage.spec.ts.
 */
describe('activityPosterior — φ извне (оценка, число, дефолт реестра)', () => {
    const series = [
        { periodKey: '2026-01', events: 100, days: 20 },
        { periodKey: '2026-03', events: 140, days: 20 },
    ];
    const prior = { mu: 6, kappa: EDGE_RATE_DEFAULTS.kappaActivity };

    it('дефолт φ берётся из реестра overdispersion_default, а не из константы', () => {
        expect(EDGE_RATE_DEFAULTS.phi).toBe(DISPERSION_DEFAULTS.fallback);
        expect(EDGE_RATE_DEFAULTS.phi).toBe(
            findParam(OVERDISPERSION_PARAM_CODE)?.defaultValue,
        );
        const result = activityPosterior({ series, prior });
        expect(result.phiSource).toBe('default');
        expect(result.phi).toBe(DISPERSION_DEFAULTS.fallback);
    });

    it('оценка quasiPoissonPhi проходит в апостериор вместе с источником', () => {
        const random = mulberry32(seedOf('edge-rate', 'phi'));
        const estimate = quasiPoissonPhi(
            Array.from({ length: 24 }, () => ({
                count: sampleOverdispersedCount(30, 3, random),
                exposure: 5,
            })),
        );
        expect(estimate.source).toBe('estimated');
        const result = activityPosterior({ series, prior, phi: estimate });
        expect(result.phi).toBe(estimate.phi);
        expect(result.phiSource).toBe('estimated');
        expect(result.value).toBeCloseTo(
            activityPosterior({ series, prior, phi: estimate.phi }).value,
            12,
        );
        expect(activityPosterior({ series, prior, phi: 1.5 }).phiSource).toBe(
            'explicit',
        );
    });

    it('пропуски периодов (gaps) уходят в shrinkActivityRate: февраль весит нулём', () => {
        const withGap = activityPosterior({ series, prior, gaps: ['2026-02'] });
        const direct = shrinkActivityRate({ series, prior, gaps: ['2026-02'] });
        expect(withGap).toEqual(direct);
        expect(withGap.gaps).toBe(1);
        expect(withGap.forgottenDays).toBeCloseTo(20 + 0.85 ** 2 * 20, 9);
        expect(activityPosterior({ series, prior }).forgottenDays).toBeCloseTo(
            20 + 0.85 * 20,
            9,
        );
    });
});
