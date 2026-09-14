import { shrinkActivityRate } from '../model/activity-rate';
import { activityPosterior, edgePosterior } from '../model/edge-rate';
import {
    mulberry32,
    sampleBeta,
    sampleBinomial,
    sampleGamma,
    seedOf,
} from '../model/prng';
import { sampleOverdispersedCount } from './rate-synthetic.fixture';

/**
 * Приёмка Фазы 2 (§6): на синтетике с известными θ не менее 85 % ячеек
 * попадают в 90 %-интервал апостериора. Ячейки с κμ < 2 отфильтрованы —
 * там квантили Уилсона–Хилферти для гаммы неточны, и в рантайме такие
 * ячейки получают confidence: none.
 */
const CELLS = 500;
const MIN_KAPPA_MU = 2;
const MIN_COVERAGE = 0.85;
const SEEDS = [1, 2, 3] as const;

interface Coverage {
    covered: number;
    cells: number;
    /** Кандидатов, отброшенных фильтром κμ ≥ 2. */
    rejected: number;
    /** Веса собственных данных всех ячеек — инвариант w ∈ [0, 1]. */
    weights: number[];
}

const pick = <T>(items: readonly T[], random: () => number): T =>
    items[Math.floor(random() * items.length)];

const logUniform = (low: number, high: number, random: () => number): number =>
    Math.exp(Math.log(low) + random() * (Math.log(high) - Math.log(low)));

const covers = (ci: [number, number] | null, truth: number): boolean =>
    ci !== null && truth >= ci[0] && truth <= ci[1];

/**
 * Доли: θ ~ Beta(κμ, κ(1 − μ)) — прайор согласован с усадкой, s ~ Bin(n, θ),
 * интервал — Уилсон на псевдосчётчиках (edgePosterior).
 */
function coverBeta(seed: number): Coverage {
    const random = mulberry32(seed);
    const result: Coverage = { covered: 0, cells: 0, rejected: 0, weights: [] };
    while (result.cells < CELLS) {
        const mu = 0.02 + 0.38 * random();
        const kappa = pick([10, 30, 100], random);
        if (kappa * mu < MIN_KAPPA_MU) {
            result.rejected += 1;
            continue;
        }
        const theta = sampleBeta(kappa * mu, kappa * (1 - mu), random);
        const exposure = 20 + Math.floor(random() * 130);
        const successes = sampleBinomial(exposure, theta, random);
        const posterior = edgePosterior({
            successes,
            exposure,
            prior: { mu, kappa },
        });
        result.cells += 1;
        result.weights.push(posterior.w);
        if (covers(posterior.ci90, theta)) {
            result.covered += 1;
        }
    }
    return result;
}

/**
 * Темпы: a ~ Gamma(κμ, κ), 1–3 месяца по 15–22 дня, счёт — гамма-смесь
 * NegBin с квази-пуассоновской φ (φ = 1 — Пуассон), апостериор
 * Gamma(Ñ/φ + κμ, D̃/φ + κ) с той же φ и забыванием по умолчанию.
 */
function coverRate(seed: number, phi: number): Coverage {
    const random = mulberry32(seed);
    const result: Coverage = { covered: 0, cells: 0, rejected: 0, weights: [] };
    while (result.cells < CELLS) {
        const mu = logUniform(0.05, 6, random);
        const kappa = pick([10, 20, 40], random);
        if (kappa * mu < MIN_KAPPA_MU) {
            result.rejected += 1;
            continue;
        }
        const rate = sampleGamma(kappa * mu, random) / kappa;
        const months = 1 + Math.floor(random() * 3);
        const series = Array.from({ length: months }, (_, index) => {
            const days = 15 + Math.floor(random() * 8);
            return {
                periodKey: `2026-0${index + 1}`,
                days,
                events: sampleOverdispersedCount(rate * days, phi, random),
            };
        });
        const posterior = shrinkActivityRate({
            series,
            prior: { mu, kappa },
            phi,
        });
        result.cells += 1;
        result.weights.push(posterior.w);
        if (covers(posterior.ci90, rate)) {
            result.covered += 1;
        }
    }
    return result;
}

const share = (coverage: Coverage): number => coverage.covered / coverage.cells;

describe('покрытие 90 %-интервала: доли (Beta-биномиал, Уилсон на псевдосчётчиках)', () => {
    it.each(SEEDS)('seed %i: 500 ячеек с κμ ≥ 2, ≥ 85 % накрыты', index => {
        const coverage = coverBeta(seedOf('coverage', 'beta', index));
        expect(coverage.cells).toBe(CELLS);
        expect(coverage.rejected).toBeGreaterThan(0);
        expect(share(coverage)).toBeGreaterThanOrEqual(MIN_COVERAGE);
    });
});

describe('покрытие 90 %-интервала: темпы (гамма-Пуассон и гамма-смесь NegBin)', () => {
    it.each(SEEDS)(
        'Пуассон, seed %i: 500 ячеек с κμ ≥ 2, ≥ 85 % накрыты',
        index => {
            const coverage = coverRate(seedOf('coverage', 'poisson', index), 1);
            expect(coverage.cells).toBe(CELLS);
            expect(coverage.rejected).toBeGreaterThan(0);
            expect(share(coverage)).toBeGreaterThanOrEqual(MIN_COVERAGE);
        },
    );

    it.each(SEEDS)(
        'NegBin φ = 2,5, seed %i: 500 ячеек с κμ ≥ 2, ≥ 85 % накрыты',
        index => {
            const coverage = coverRate(
                seedOf('coverage', 'negbin', index),
                2.5,
            );
            expect(coverage.cells).toBe(CELLS);
            expect(share(coverage)).toBeGreaterThanOrEqual(MIN_COVERAGE);
        },
    );

    it('φ = 1 в модели на данных с φ = 2,5 недокрывает: сверхдисперсия обязана делить экспозицию', () => {
        const random = mulberry32(seedOf('coverage', 'mismatch'));
        let covered = 0;
        for (let cell = 0; cell < CELLS; cell += 1) {
            const prior = { mu: 6, kappa: 20 };
            const rate =
                sampleGamma(prior.kappa * prior.mu, random) / prior.kappa;
            const days = 20;
            const series = ['2026-01', '2026-02', '2026-03'].map(periodKey => ({
                periodKey,
                days,
                events: sampleOverdispersedCount(rate * days, 2.5, random),
            }));
            const narrow = activityPosterior({ series, prior, phi: 1 });
            if (covers(narrow.ci90, rate)) {
                covered += 1;
            }
        }
        expect(covered / CELLS).toBeLessThan(MIN_COVERAGE);
    });
});

describe('инварианты синтетики', () => {
    it('w ∈ [0, 1] во всех 1500 ячейках долей и темпов', () => {
        const weights = [
            ...coverBeta(seedOf('coverage', 'beta', 1)).weights,
            ...coverRate(seedOf('coverage', 'poisson', 1), 1).weights,
            ...coverRate(seedOf('coverage', 'negbin', 1), 2.5).weights,
        ];
        expect(weights).toHaveLength(3 * CELLS);
        expect(Math.min(...weights)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...weights)).toBeLessThanOrEqual(1);
    });

    it('покрытие воспроизводимо по seed и меняется с ним', () => {
        const first = coverBeta(seedOf('coverage', 'beta', 1));
        expect(coverBeta(seedOf('coverage', 'beta', 1))).toEqual(first);
        expect(coverBeta(seedOf('coverage', 'beta', 2)).covered).not.toBe(
            first.covered,
        );
    });
});
