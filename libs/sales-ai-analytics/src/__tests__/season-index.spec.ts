import { mulberry32, sampleNormal, seedOf } from '../model/prng';
import {
    MONTHS_IN_YEAR,
    MonthlyRatePoint,
    SEASON_INDEX_DEFAULTS,
    SEASON_INDEX_RANGE,
    normalizeSeasonIndex,
    seasonIndex,
} from '../model/season-index';
import { registryDefault } from '../params/registry.access';
import { findParam } from '../params/registry.const';

/**
 * Сезонный индекс (план §4.7; Фаза 4, поток `p4-forecast-model`):
 * ratio-to-moving-average восстанавливает синтетический паттерн по трём
 * годам, при 24 месяцах — единицы, усадка к пулу с κ_s в годах.
 */

/** Паттерн: лето 0,8, декабрь 1,3, остальное так, чтобы среднее было 1. */
const PATTERN = normalizeSeasonIndex([
    1, 1, 1, 1, 1, 0.8, 0.8, 0.8, 1, 1, 1, 1.3,
]);

const monthKey = (year: number, month: number): string =>
    `${year}-${String(month + 1).padStart(2, '0')}`;

/** Ряд темпов с сезонным паттерном, лёгким шумом и трендом. */
function seriesOf(
    months: number,
    seed: number,
    noise = 0.02,
): MonthlyRatePoint[] {
    const random = mulberry32(seed);
    const points: MonthlyRatePoint[] = [];
    for (let index = 0; index < months; index += 1) {
        const year = 2023 + Math.floor(index / MONTHS_IN_YEAR);
        const month = index % MONTHS_IN_YEAR;
        const trend = 2 + index * 0.01;
        const rate =
            trend * PATTERN[month] * (1 + noise * sampleNormal(random));
        points.push({ monthKey: monthKey(year, month), ratePerWorkday: rate });
    }

    return points;
}

const meanOf = (values: readonly number[]): number =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

describe('season-index — дефолты из реестра', () => {
    it('гейт, κ_s и диапазон берутся из дескрипторов', () => {
        expect(SEASON_INDEX_DEFAULTS.minMonths).toBe(
            findParam('season_index')?.minN,
        );
        expect(SEASON_INDEX_DEFAULTS.minMonths).toBe(36);
        expect(SEASON_INDEX_DEFAULTS.kappaYears).toBe(
            registryDefault('kappa_season_years'),
        );
        expect(SEASON_INDEX_RANGE).toEqual([0.5, 1.5]);
    });
});

describe('seasonIndex — восстановление паттерна', () => {
    const three = seasonIndex({
        monthlyRates: seriesOf(36, seedOf('season', 36)),
        pooled: null,
    });

    it('по 3 годам сырой коэффициент восстанавливает лето 0,8 и декабрь 1,3', () => {
        expect(three.source).toBe('estimated');
        expect(three.monthsUsed).toBe(36);
        expect(three.yearsUsed).toBe(3);
        three.raw.forEach((value, month) => {
            expect(Math.abs(value - PATTERN[month])).toBeLessThan(0.05);
        });
        // Скользящая средняя требует 6 месяцев с каждой стороны: 24 коэффициента.
        expect(three.observations.reduce((sum, count) => sum + count, 0)).toBe(
            24,
        );
    });

    it('индекс усажен к единице с весом n_h/(n_h + κ_s) и нормирован на среднее 1', () => {
        const kappa = SEASON_INDEX_DEFAULTS.kappaYears;
        expect(kappa).toBe(2);
        const expected = normalizeSeasonIndex(
            three.raw.map((value, month) => {
                const weight = three.observations[month];
                return (weight * value + kappa) / (weight + kappa);
            }),
        );
        three.index.forEach((value, month) => {
            expect(value).toBeCloseTo(expected[month], 10);
            // При n_h = 2 и κ_s = 2 усадка — ровно половина пути к единице.
            expect(three.observations[month]).toBe(2);
        });
        expect(meanOf(three.index)).toBeCloseTo(1, 6);
        // Лето ниже единицы, декабрь выше — направление сохраняется.
        expect(three.index[6]).toBeLessThan(0.95);
        expect(three.index[11]).toBeGreaterThan(1.05);
    });

    it('при κ_s = 0 индекс равен сырому коэффициенту', () => {
        const pure = seasonIndex({
            monthlyRates: seriesOf(36, seedOf('season', 36)),
            pooled: null,
            kappaYears: 0,
        });
        pure.index.forEach((value, month) => {
            expect(value).toBeCloseTo(pure.raw[month], 10);
        });
    });

    it('ряд без сезона, но с трендом даёт единицы (скользящая средняя снимает тренд)', () => {
        const flat: MonthlyRatePoint[] = Array.from(
            { length: 48 },
            (_, index) => ({
                monthKey: monthKey(2022 + Math.floor(index / 12), index % 12),
                ratePerWorkday: 1 + index * 0.05,
            }),
        );
        const result = seasonIndex({ monthlyRates: flat, pooled: null });
        expect(result.source).toBe('estimated');
        result.raw.forEach(value => expect(value).toBeCloseTo(1, 3));
        result.index.forEach(value => expect(value).toBeCloseTo(1, 3));
    });

    it('индекс в диапазоне [0,5; 1,5] даже при экстремальном паттерне', () => {
        const spiky = seriesOf(48, seedOf('season', 'spiky')).map(point =>
            point.monthKey.endsWith('-12')
                ? { ...point, ratePerWorkday: point.ratePerWorkday * 4 }
                : point,
        );
        const result = seasonIndex({
            monthlyRates: spiky,
            pooled: null,
            kappaYears: 0,
        });
        result.index.forEach(value => {
            expect(value).toBeGreaterThanOrEqual(SEASON_INDEX_RANGE[0]);
            expect(value).toBeLessThanOrEqual(SEASON_INDEX_RANGE[1]);
        });
    });
});

describe('seasonIndex — гейт и пул', () => {
    it('24 месяца без пула — единицы, source default', () => {
        const result = seasonIndex({
            monthlyRates: seriesOf(24, seedOf('season', 24)),
            pooled: null,
        });
        expect(result.source).toBe('default');
        expect(result.index).toEqual(Array.from({ length: 12 }, () => 1));
        expect(result.monthsUsed).toBe(24);
        expect(result.raw).toEqual(Array.from({ length: 12 }, () => 1));
    });

    it('24 месяца с пулом — индекс пула, source pooled', () => {
        const result = seasonIndex({
            monthlyRates: seriesOf(24, seedOf('season', 24)),
            pooled: PATTERN,
        });
        expect(result.source).toBe('pooled');
        result.index.forEach((value, month) => {
            expect(value).toBeCloseTo(PATTERN[month], 10);
        });
    });

    it('36 месяцев с пулом — усадка к пулу, source shrunk', () => {
        const pooled = normalizeSeasonIndex([
            1.2, 1.1, 1, 1, 1, 1, 1, 1, 1, 1, 0.9, 0.8,
        ]);
        const result = seasonIndex({
            monthlyRates: seriesOf(36, seedOf('season', 36)),
            pooled,
        });
        expect(result.source).toBe('shrunk');
        // Декабрь: данные 1,3, пул 0,8 при n_h = 2, κ = 2 → около 1,05.
        expect(result.index[11]).toBeGreaterThan(pooled[11]);
        expect(result.index[11]).toBeLessThan(result.raw[11]);
        expect(meanOf(result.index)).toBeCloseTo(1, 6);
    });

    it('пул неверной длины игнорируется', () => {
        const result = seasonIndex({
            monthlyRates: seriesOf(24, seedOf('season', 24)),
            pooled: [1, 2, 3],
        });
        expect(result.source).toBe('default');
    });

    it('битые ключи и NaN не считаются месяцами', () => {
        const result = seasonIndex({
            monthlyRates: [
                { monthKey: '2024-13', ratePerWorkday: 1 },
                { monthKey: 'abc', ratePerWorkday: 1 },
                { monthKey: '2024-01', ratePerWorkday: Number.NaN },
                { monthKey: '2024-02', ratePerWorkday: 1 },
            ],
            pooled: null,
        });
        expect(result.monthsUsed).toBe(1);
        expect(result.source).toBe('default');
    });

    it('детерминизм: два вызова → toEqual', () => {
        const rates = seriesOf(40, seedOf('season', 40));
        expect(seasonIndex({ monthlyRates: rates, pooled: null })).toEqual(
            seasonIndex({ monthlyRates: rates, pooled: null }),
        );
    });
});
