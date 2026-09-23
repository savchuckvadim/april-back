import { AI_ANALYTICS_PARAM_DEFAULTS } from '../../../params/registry.const';
import { mulberry32, sampleNormal } from '../../prng';
import { normalCdf } from '../../style-shrink';
import { AGREEMENT_DEFAULTS } from '../agreement.types';
import { differenceStats, pairDifferences, tost, tostOfPairs } from '../tost';

/** Разности со средним 0 и SE = 1: [−√3, √3, −√3, √3] → sd = 2, SE = 2/√4. */
const UNIT_SE = [-Math.sqrt(3), Math.sqrt(3), -Math.sqrt(3), Math.sqrt(3)];

/** n разностей со средним mean и sd ≈ spread (чередование ±spread). */
const alternating = (n: number, mean: number, spread: number): number[] =>
    Array.from({ length: n }, (_, i) =>
        i % 2 === 0 ? mean + spread : mean - spread,
    );

describe('differenceStats / pairDifferences', () => {
    it('[1, 2, 3, 4] → mean 2,5, sd = √(5/3), SE = sd/2', () => {
        const stats = differenceStats([1, 2, 3, 4]);
        expect(stats?.n).toBe(4);
        expect(stats?.mean).toBeCloseTo(2.5, 12);
        expect(stats?.sd).toBeCloseTo(Math.sqrt(5 / 3), 12);
        expect(stats?.se).toBeCloseTo(Math.sqrt(5 / 3) / 2, 12);
    });

    it('одна разность → sd = 0; пусто → null; NaN отбрасывается', () => {
        expect(differenceStats([2])).toEqual({ n: 1, mean: 2, sd: 0, se: 0 });
        expect(differenceStats([])).toBeNull();
        expect(differenceStats([Number.NaN, 3])?.n).toBe(1);
    });

    it('pairDifferences: первый − второй, пары с бесконечностями отбрасываются', () => {
        expect(
            pairDifferences([
                { first: 7, second: 5 },
                { first: 3, second: 6 },
                { first: Number.POSITIVE_INFINITY, second: 1 },
            ]),
        ).toEqual([2, -3]);
    });
});

describe('tost: граничные случаи (Schuirmann, 1987)', () => {
    it('интервал касается границы: d̄ = 0, Δ = z·SE → p = α, не эквивалентно', () => {
        const z = AGREEMENT_DEFAULTS.z;
        // Граница берётся из фактического SE: √3² в float не ровно 3,
        // поэтому Δ = z·SE, а не литерал z.
        const se = differenceStats(UNIT_SE)?.se as number;
        const result = tost(UNIT_SE, { bound: z * se });
        expect(result?.mean).toBe(0);
        expect(se).toBeCloseTo(1, 12);
        expect(result?.ci[0]).toBeCloseTo(-z, 12);
        expect(result?.ci[1]).toBeCloseTo(z, 12);
        expect(result?.pLower).toBeCloseTo(result?.alpha as number, 9);
        expect(result?.pUpper).toBeCloseTo(result?.alpha as number, 9);
        expect(result?.p).toBeCloseTo(1 - normalCdf(z), 9);
        expect(result?.equivalent).toBe(false);
    });

    it('среднее на границе: d̄ = Δ → pUpper = Φ(0) = 0,5, не эквивалентно', () => {
        const result = tost([1.5, 2.5], { bound: 2 });
        expect(result?.mean).toBeCloseTo(2, 12);
        // Точность аппроксимации Φ (Абрамовиц–Стиган) ~1e-7.
        expect(result?.pUpper).toBeCloseTo(0.5, 6);
        expect(result?.p).toBeCloseTo(0.5, 6);
        expect(result?.equivalent).toBe(false);
    });

    it('внутри границы: 300 пар, sd = σ_llm·√2, d̄ = 0,1, Δ = 1 → эквивалентно, p ≈ 0', () => {
        const spread = AGREEMENT_DEFAULTS.sigmaLlmConfigured * Math.SQRT2;
        const result = tost(alternating(300, 0.1, spread), { bound: 1 });
        expect(result?.n).toBe(300);
        expect(result?.mean).toBeCloseTo(0.1, 12);
        expect(result?.se).toBeCloseTo(
            (spread * Math.sqrt(300 / 299)) / Math.sqrt(300),
            12,
        );
        expect(result?.equivalent).toBe(true);
        expect(result?.p as number).toBeLessThan(1e-6);
    });

    it('идентичные прогоны: sd = 0 → обе p = 0, эквивалентно при любой Δ > 0', () => {
        const result = tost([0, 0, 0], { bound: 0.01 });
        expect(result?.se).toBe(0);
        expect(result?.pLower).toBe(0);
        expect(result?.pUpper).toBe(0);
        expect(result?.equivalent).toBe(true);
    });

    it('постоянный сдвиг за границей: sd = 0, d̄ = 2 > Δ = 1 → pUpper = 1, не эквивалентно', () => {
        const result = tost([2, 2, 2], { bound: 1 });
        expect(result?.pLower).toBe(0);
        expect(result?.pUpper).toBe(1);
        expect(result?.equivalent).toBe(false);
    });

    it('дефолты из реестра: z = z_compare, α = 1 − Φ(z) ≈ 0,05, Δ = delta_prac_score', () => {
        expect(AGREEMENT_DEFAULTS.z).toBe(
            AI_ANALYTICS_PARAM_DEFAULTS.z_compare,
        );
        expect(AGREEMENT_DEFAULTS.tostBound).toBe(
            AI_ANALYTICS_PARAM_DEFAULTS.delta_prac_score,
        );
        const result = tost(UNIT_SE, { bound: AGREEMENT_DEFAULTS.tostBound });
        expect(result?.z).toBe(AGREEMENT_DEFAULTS.z);
        expect(result?.alpha).toBeCloseTo(0.05, 3);
        expect(result?.bound).toBe(AGREEMENT_DEFAULTS.tostBound);
    });

    it('меньше двух разностей или Δ ≤ 0 → null', () => {
        expect(tost([1], { bound: 1 })).toBeNull();
        expect(tost([], { bound: 1 })).toBeNull();
        expect(tost([1, 2], { bound: 0 })).toBeNull();
        expect(tost([1, 2], { bound: -1 })).toBeNull();
        expect(tostOfPairs([{ first: 1, second: 1 }], { bound: 1 })).toBeNull();
    });
});

describe('tost: свойства', () => {
    const randomDifferences = (random: () => number): number[] =>
        Array.from(
            { length: 40 },
            () => 0.5 * sampleNormal(random) + sampleNormal(random),
        );

    it('симметрия: смена знака разностей меняет местами pLower и pUpper, зеркалит интервал, вердикт тот же', () => {
        const random = mulberry32(31);
        for (let round = 0; round < 100; round += 1) {
            const differences = randomDifferences(random);
            const bound = 0.2 + random();
            const direct = tost(differences, { bound });
            const mirror = tost(
                differences.map(value => -value),
                { bound },
            );
            expect(mirror?.mean).toBeCloseTo(-(direct?.mean as number), 12);
            expect(mirror?.sd).toBeCloseTo(direct?.sd as number, 12);
            expect(mirror?.pLower).toBeCloseTo(direct?.pUpper as number, 12);
            expect(mirror?.pUpper).toBeCloseTo(direct?.pLower as number, 12);
            expect(mirror?.ci[0]).toBeCloseTo(-(direct?.ci[1] as number), 12);
            expect(mirror?.equivalent).toBe(direct?.equivalent);
        }
    });

    it('эквивалентность по интервалу ⇔ p < α; p не растёт с ростом Δ', () => {
        const random = mulberry32(32);
        for (let round = 0; round < 100; round += 1) {
            const differences = randomDifferences(random);
            const narrow = tost(differences, { bound: 0.3 });
            const wide = tost(differences, { bound: 0.9 });
            for (const result of [narrow, wide]) {
                expect(result?.equivalent).toBe(
                    (result?.p as number) < (result?.alpha as number),
                );
            }
            expect(wide?.p as number).toBeLessThanOrEqual(narrow?.p as number);
            if (narrow?.equivalent) {
                expect(wide?.equivalent).toBe(true);
            }
        }
    });
});
