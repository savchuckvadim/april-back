import {
    LAG_CDF_SHRINK_DEFAULTS,
    hybridCycleMedian,
    portalTableGate,
    shrinkLagCdf,
    shrinkWeight,
} from '../model/lag-cdf-shrink';
import {
    exponentialLagCdf,
    kaplanMeierLagCdf,
    lagCdfFromTable,
} from '../model/lag-cdf';
import { registryDefault } from '../params/registry.access';

/**
 * Усадка портальной таблицы F(d) к общей и гибрид медианы цикла
 * (план §4.8; Фаза 4, поток `p4-forecast-model`): w = n/(n + κ),
 * инварианты cure-формы сохраняются, без общей таблицы — портал как есть.
 */
describe('lag-cdf-shrink — дефолты из реестра', () => {
    it('κ, гейт, прайор медианы и сетка — коды реестра', () => {
        expect(LAG_CDF_SHRINK_DEFAULTS.kappa).toBe(
            registryDefault('lag_cdf_kappa'),
        );
        expect(LAG_CDF_SHRINK_DEFAULTS.portalMinN).toBe(
            registryDefault('lag_cdf_portal_min_n'),
        );
        expect(LAG_CDF_SHRINK_DEFAULTS.priorMedianDays).toBe(
            registryDefault('cycle_median_days'),
        );
        expect(LAG_CDF_SHRINK_DEFAULTS.gridDays).toBe(
            registryDefault('lag_window_sale_days'),
        );
        expect(LAG_CDF_SHRINK_DEFAULTS.kappa).toBe(20);
        expect(LAG_CDF_SHRINK_DEFAULTS.portalMinN).toBe(100);
    });
});

describe('shrinkWeight и portalTableGate', () => {
    it('w = n/(n + κ), w ∈ [0; 1]', () => {
        expect(shrinkWeight(20, 20)).toBe(0.5);
        expect(shrinkWeight(180, 20)).toBe(0.9);
        expect(shrinkWeight(0, 20)).toBe(0);
        expect(shrinkWeight(50, 0)).toBe(1);
        expect(shrinkWeight(Number.NaN, 20)).toBe(0);
    });

    it('гейт портальной таблицы — n ≥ lag_cdf_portal_min_n', () => {
        expect(portalTableGate(99)).toBe(false);
        expect(portalTableGate(100)).toBe(true);
        expect(portalTableGate(50, 30)).toBe(true);
        expect(portalTableGate(Number.NaN)).toBe(false);
    });
});

/** Портальная таблица: быстрый лаг (медиана 10 дней). */
const portal = exponentialLagCdf(10);
/** Общая таблица: медленный лаг (медиана 40 дней). */
const global = exponentialLagCdf(40);

describe('shrinkLagCdf', () => {
    it('F = w·F_portal + (1 − w)·F_global при w = n/(n + κ)', () => {
        const shrunk = shrinkLagCdf(portal, global, 60, { kappa: 20 });
        expect(shrunk.w).toBe(0.75);
        expect(shrunk.source).toBe('shrunk');
        expect(shrunk.kind).toBe('table');
        expect(shrunk.n).toBe(60);
        for (const day of [1, 5, 10, 28, 45, 90, 400]) {
            expect(shrunk.at(day)).toBeCloseTo(
                0.75 * portal.at(day) + 0.25 * global.at(day),
                12,
            );
        }
    });

    it('инварианты cure-формы: F(0) = 0, монотонно, ∈ [0; 1], F(∞) → 1', () => {
        const shrunk = shrinkLagCdf(portal, global, 40);
        expect(shrunk.at(0)).toBe(0);
        expect(shrunk.at(-3)).toBe(0);
        let previous = 0;
        for (let day = 1; day <= 400; day += 1) {
            const value = shrunk.at(day);
            expect(value).toBeGreaterThanOrEqual(previous);
            expect(value).toBeLessThanOrEqual(1);
            previous = value;
        }
        expect(shrunk.at(3660)).toBeCloseTo(1, 8);
    });

    it('точки на общей сетке 1..gridDays монотонны и совпадают с at', () => {
        const shrunk = shrinkLagCdf(portal, global, 40, { gridDays: 90 });
        expect(shrunk.points).toHaveLength(90);
        expect(shrunk.points[0].days).toBe(1);
        expect(shrunk.points[89].days).toBe(90);
        shrunk.points.forEach((point, index) => {
            expect(point.value).toBeCloseTo(shrunk.at(point.days), 12);
            if (index > 0) {
                expect(point.value).toBeGreaterThanOrEqual(
                    shrunk.points[index - 1].value,
                );
            }
        });
        expect(shrinkLagCdf(portal, global, 40).points).toHaveLength(
            LAG_CDF_SHRINK_DEFAULTS.gridDays,
        );
    });

    it('без общей таблицы портал берётся как есть (w = 1, source portal)', () => {
        const own = shrinkLagCdf(portal, null, 40);
        expect(own.w).toBe(1);
        expect(own.source).toBe('portal');
        for (const day of [1, 10, 30, 60]) {
            expect(own.at(day)).toBeCloseTo(portal.at(day), 12);
        }
    });

    it('медиана усадки лежит между медианами портала и общей таблицы', () => {
        const shrunk = shrinkLagCdf(portal, global, 20, { gridDays: 120 });
        expect(shrunk.medianDays).not.toBeNull();
        expect(shrunk.medianDays ?? 0).toBeGreaterThan(10);
        expect(shrunk.medianDays ?? 0).toBeLessThan(40);
    });

    it('работает поверх таблиц Каплана–Мейера и готовых таблиц', () => {
        const km = kaplanMeierLagCdf(
            Array.from({ length: 40 }, (_, index) => ({
                days: 5 + (index % 20),
            })),
            30,
            60,
        );
        expect(km).not.toBeNull();
        const table = lagCdfFromTable([
            { days: 10, value: 0.3 },
            { days: 30, value: 0.7 },
            { days: 60, value: 1 },
        ]);
        if (km === null) return;
        const shrunk = shrinkLagCdf(km, table, 40, { kappa: 20 });
        expect(shrunk.at(60)).toBeCloseTo(1, 12);
        expect(shrunk.at(10)).toBeCloseTo(
            (40 / 60) * km.at(10) + (20 / 60) * 0.3,
            12,
        );
    });

    it('детерминизм: одинаковый вход → одинаковые точки', () => {
        expect(shrinkLagCdf(portal, global, 40).points).toEqual(
            shrinkLagCdf(portal, global, 40).points,
        );
    });
});

describe('hybridCycleMedian', () => {
    it('прайор 28 → медиана портала с w = n/(n + 20)', () => {
        expect(hybridCycleMedian({ portalMedian: 14, n: 20 })).toEqual({
            median: 21,
            w: 0.5,
        });
        const late = hybridCycleMedian({ portalMedian: 14, n: 180 });
        expect(late.w).toBeCloseTo(0.9, 12);
        expect(late.median).toBeCloseTo(0.9 * 14 + 0.1 * 28, 12);
    });

    it('без медианы портала — прайор с w = 0', () => {
        expect(hybridCycleMedian({ portalMedian: null, n: 100 })).toEqual({
            median: LAG_CDF_SHRINK_DEFAULTS.priorMedianDays,
            w: 0,
        });
        expect(hybridCycleMedian({ portalMedian: 0, n: 100 }).w).toBe(0);
    });

    it('прайор и κ переопределяются входом', () => {
        expect(
            hybridCycleMedian({
                prior: 40,
                portalMedian: 20,
                n: 10,
                kappa: 10,
            }),
        ).toEqual({ median: 30, w: 0.5 });
    });
});
