import {
    DISPERSION_DEFAULTS,
    OVERDISPERSION_PARAM_CODE,
    OverdispersionPoint,
    quasiPoissonPhi,
} from '../model/overdispersion';
import { mulberry32, seedOf } from '../model/prng';
import { findParam } from '../params/registry.const';
import { sampleOverdispersedCount } from './rate-synthetic.fixture';

/** Рабочих дней в неделе и звонков в день: μ = 30 событий в неделю. */
const WEEK_DAYS = 5;
const CALLS_PER_DAY = 6;
const WEEK_MEAN = WEEK_DAYS * CALLS_PER_DAY;

interface WeeksOptions {
    weeks: number;
    phi: number;
    seed: number;
    rate?: number;
    cellKey?: string;
}

/** Недельный ряд одной ячейки с известной квази-пуассоновской φ. */
function syntheticWeeks(options: WeeksOptions): OverdispersionPoint[] {
    const random = mulberry32(options.seed);
    const rate = options.rate ?? CALLS_PER_DAY;
    return Array.from({ length: options.weeks }, () => ({
        count: sampleOverdispersedCount(rate * WEEK_DAYS, options.phi, random),
        exposure: WEEK_DAYS,
        ...(options.cellKey === undefined ? {} : { cellKey: options.cellKey }),
    }));
}

const relativeError = (estimate: number, truth: number): number =>
    Math.abs(estimate - truth) / truth;

describe('DISPERSION_DEFAULTS — из дескриптора реестра overdispersion_default', () => {
    it('прайор 2,5, гейт 12 недель и клип [1; 6] совпадают с дескриптором', () => {
        const descriptor = findParam(OVERDISPERSION_PARAM_CODE);
        expect(descriptor).toBeDefined();
        expect(descriptor?.defaultValue).toBe(DISPERSION_DEFAULTS.fallback);
        expect(descriptor?.minN).toBe(DISPERSION_DEFAULTS.minWeeks);
        expect(descriptor?.range).toEqual([
            DISPERSION_DEFAULTS.min,
            DISPERSION_DEFAULTS.max,
        ]);
        expect(DISPERSION_DEFAULTS).toEqual({
            fallback: 2.5,
            minWeeks: 12,
            min: 1,
            max: 6,
        });
    });
});

describe('quasiPoissonPhi — формула Пирсона', () => {
    it('12 недель [2,4,6,8]×3 при e = 1: a = 5, Σ(y − 5)²/5 = 12, φ = 12/11', () => {
        const counts = [2, 4, 6, 8, 2, 4, 6, 8, 2, 4, 6, 8];
        const result = quasiPoissonPhi(
            counts.map(count => ({ count, exposure: 1 })),
        );
        expect(result.source).toBe('estimated');
        expect(result.weeks).toBe(12);
        expect(result.cells).toBe(1);
        expect(result.phiHat).toBeCloseTo(12 / 11, 12);
        expect(result.phi).toBeCloseTo(12 / 11, 12);
    });

    it('μ_i = a·e_i: разная экспозиция при постоянном темпе — остатки нулевые, φ клипается к 1', () => {
        const points = Array.from({ length: 12 }, (_, index) => ({
            count: 3 * (index + 1),
            exposure: index + 1,
        }));
        const result = quasiPoissonPhi(points);
        expect(result.phiHat).toBeCloseTo(0, 12);
        expect(result.phi).toBe(DISPERSION_DEFAULTS.min);
        expect(result.source).toBe('estimated');
    });

    it('ячейки менеджер × тип: Пуассон при разных темпах даёт φ ≈ 1, без ключа ячейки — раздутую', () => {
        const slow = syntheticWeeks({
            weeks: 100,
            phi: 1,
            seed: seedOf('cells', 'slow'),
            rate: 2,
            cellKey: 'm1',
        });
        const fast = syntheticWeeks({
            weeks: 100,
            phi: 1,
            seed: seedOf('cells', 'fast'),
            rate: 10,
            cellKey: 'm2',
        });
        const byCell = quasiPoissonPhi([...slow, ...fast]);
        const pooled = quasiPoissonPhi(
            [...slow, ...fast].map(({ count, exposure }) => ({
                count,
                exposure,
            })),
        );
        expect(byCell.cells).toBe(2);
        expect(byCell.weeks).toBe(200);
        expect(byCell.phiHat).toBeGreaterThan(0.75);
        expect(byCell.phiHat).toBeLessThan(1.25);
        // Одна подобранная средняя (30) на темпы 10 и 50: Σ(y − 30)²/30 ≫ n.
        expect(pooled.cells).toBe(1);
        expect(pooled.phiHat).toBeGreaterThan(3);
        expect(pooled.phi).toBe(DISPERSION_DEFAULTS.max);
    });
});

describe('quasiPoissonPhi — гейт и дефолт', () => {
    it('11 недель — дефолт реестра, оценки нет', () => {
        const result = quasiPoissonPhi(
            syntheticWeeks({ weeks: 11, phi: 3, seed: 1 }),
        );
        expect(result).toEqual({
            phi: DISPERSION_DEFAULTS.fallback,
            source: 'default',
            weeks: 11,
            cells: 1,
            phiHat: null,
        });
    });

    it('12 недель — гейт открыт, источник estimated', () => {
        const result = quasiPoissonPhi(
            syntheticWeeks({ weeks: 12, phi: 3, seed: 1 }),
        );
        expect(result.source).toBe('estimated');
        expect(result.phiHat).not.toBeNull();
    });

    it('точки с нулевой, отрицательной или NaN экспозицией не считаются неделями', () => {
        const good = syntheticWeeks({ weeks: 12, phi: 2, seed: 5 });
        const bad: OverdispersionPoint[] = [
            { count: 5, exposure: 0 },
            { count: 5, exposure: -3 },
            { count: Number.NaN, exposure: 5 },
            { count: 5, exposure: Number.NaN },
        ];
        expect(quasiPoissonPhi([...good, ...bad]).weeks).toBe(12);
        expect(quasiPoissonPhi([...good.slice(1), ...bad]).source).toBe(
            'default',
        );
    });

    it('ряд без событий — информации о дисперсии нет: дефолт, 0 ячеек', () => {
        const zeros = Array.from({ length: 20 }, () => ({
            count: 0,
            exposure: 5,
        }));
        const result = quasiPoissonPhi(zeros);
        expect(result.source).toBe('default');
        expect(result.weeks).toBe(0);
        expect(result.cells).toBe(0);
    });

    it('гейт ниже минимума: одна неделя на ячейку не оставляет степеней свободы', () => {
        const result = quasiPoissonPhi([{ count: 7, exposure: 5 }], {
            minWeeks: 1,
        });
        expect(result.source).toBe('default');
        expect(result.weeks).toBe(1);
    });

    it('опции перекрывают реестр: свой гейт и свой дефолт, дефолт клипается', () => {
        const short = syntheticWeeks({ weeks: 6, phi: 2, seed: 9 });
        expect(quasiPoissonPhi(short, { minWeeks: 4 }).source).toBe(
            'estimated',
        );
        expect(quasiPoissonPhi(short, { fallback: 3.1 })).toMatchObject({
            phi: 3.1,
            source: 'default',
        });
        expect(quasiPoissonPhi(short, { fallback: 10 }).phi).toBe(
            DISPERSION_DEFAULTS.max,
        );
    });
});

describe('quasiPoissonPhi — восстановление φ на синтетике NegBin (200 недель)', () => {
    it('фикстура: Var/mean ≈ φ (2000 недель, φ = 2,5)', () => {
        const random = mulberry32(seedOf('fixture', 'variance'));
        const draws = Array.from({ length: 2000 }, () =>
            sampleOverdispersedCount(WEEK_MEAN, 2.5, random),
        );
        const mean = draws.reduce((acc, y) => acc + y, 0) / draws.length;
        const variance =
            draws.reduce((acc, y) => acc + (y - mean) ** 2, 0) /
            (draws.length - 1);
        expect(relativeError(mean, WEEK_MEAN)).toBeLessThan(0.05);
        expect(relativeError(variance / mean, 2.5)).toBeLessThan(0.15);
    });

    it.each([
        [2.5, 1],
        [2.5, 2],
        [3, 3],
        [4, 4],
    ])(
        'φ = %s (r = μ/(φ − 1)), seed %i: оценка в пределах ±20 %',
        (phi, seed) => {
            const result = quasiPoissonPhi(
                syntheticWeeks({
                    weeks: 200,
                    phi,
                    seed: seedOf('negbin', phi, seed),
                }),
            );
            expect(result.source).toBe('estimated');
            expect(result.weeks).toBe(200);
            expect(result.phiHat).not.toBeNull();
            expect(relativeError(result.phiHat ?? 0, phi)).toBeLessThan(0.2);
            expect(relativeError(result.phi, phi)).toBeLessThan(0.2);
        },
    );

    it('чистый Пуассон: оценка около 1, после клипа не ниже 1', () => {
        const result = quasiPoissonPhi(
            syntheticWeeks({ weeks: 200, phi: 1, seed: seedOf('poisson') }),
        );
        expect(relativeError(result.phiHat ?? 0, 1)).toBeLessThan(0.2);
        expect(result.phi).toBeGreaterThanOrEqual(DISPERSION_DEFAULTS.min);
    });

    it('клип: φ = 16 (r = 2) режется к 6, сырая оценка остаётся в phiHat', () => {
        const result = quasiPoissonPhi(
            syntheticWeeks({ weeks: 200, phi: 16, seed: seedOf('clip') }),
        );
        expect(result.phi).toBe(DISPERSION_DEFAULTS.max);
        expect(result.phiHat).toBeGreaterThan(DISPERSION_DEFAULTS.max);
    });

    it('оценка детерминирована по seed', () => {
        const series = syntheticWeeks({ weeks: 50, phi: 2, seed: 77 });
        expect(quasiPoissonPhi(series)).toEqual(quasiPoissonPhi(series));
        expect(
            syntheticWeeks({ weeks: 50, phi: 2, seed: 77 }).map(p => p.count),
        ).toEqual(series.map(p => p.count));
    });
});
