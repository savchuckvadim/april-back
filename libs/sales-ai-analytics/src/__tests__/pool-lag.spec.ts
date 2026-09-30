import {
    LAG_CDF_DEFAULTS,
    exponentialLagCdf,
    kaplanMeierLagCdf,
    lagCdfFromTable,
    type LagCdf,
} from '../model/lag-cdf';
import {
    POOL_LAG_DEFAULTS,
    SEASON_INDEX_LENGTH,
    isUsableSeasonIndex,
    poolLagCdf,
    poolLognormal,
    poolSeasonIndex,
} from '../model/pool-lag';
import type { PoolPortalInput } from '../model/pool.types';
import { mulberry32, seedOf } from '../model/prng';
import { registryDefault, registryRangeOf } from '../params/registry.access';

/**
 * Пул лага, логнормального чека и сезона (план §4.8 F_lag, §4.7 SI_0,
 * §4.11 «Ежеквартально»): инварианты F(d), n-взвешивание, гейт сезона.
 */

const portalOf = (
    key: string,
    overrides: Partial<PoolPortalInput> = {},
): PoolPortalInput => ({
    portalKey: key,
    consentAt: '2026-01-01',
    historyMonths: 12,
    managers: 5,
    edges: [],
    beta: null,
    lagCdf: null,
    lognormal: null,
    seasonIndex: null,
    ...overrides,
});

/** Экспонента с заданной медианой и объёмом продаж n. */
const expWithN = (medianDays: number, n: number): LagCdf => ({
    ...exponentialLagCdf(medianDays),
    n,
});

/** Результат обязан быть не null — иначе тест падает здесь, а не на поле. */
const must = <T>(value: T | null): T => {
    if (value === null) {
        throw new Error('ожидался результат, получен null');
    }

    return value;
};

/** Математика пула без гейта обезличенности (гейт проверяется отдельно). */
const MATH = { minPortals: 1 } as const;

const assertCdfInvariants = (cdf: LagCdf): void => {
    expect(cdf.kind).toBe('table');
    expect(cdf.at(0)).toBe(0);
    expect(cdf.at(-3)).toBe(0);
    for (let day = 1; day <= 200; day += 1) {
        const value = cdf.at(day);
        expect(value).toBeGreaterThanOrEqual(cdf.at(day - 1));
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
    }
};

describe('poolLagCdf', () => {
    const portals = [
        portalOf('a', { lagCdf: expWithN(14, 100) }),
        portalOf('b', { lagCdf: expWithN(56, 300) }),
    ];

    it('F(d) = Σ n_i F_i(d)/Σ n_i: F(28) ≈ 0,4072 при медианах 14 и 56', () => {
        const cdf = must(poolLagCdf(portals, MATH));
        expect(cdf.points[0]).toEqual({ days: 0, value: 0 });
        expect(cdf.n).toBe(400);
        expect(cdf.at(28)).toBeCloseTo(
            (100 * 0.75 + 300 * (1 - Math.SQRT1_2)) / 400,
            12,
        );
        expect(cdf.at(28)).toBeCloseTo(0.4072, 4);
        // Медиана пула — первый день с F ≥ 0,5.
        expect(cdf.medianDays).toBe(
            cdf.points.find(point => point.value >= 0.5)?.days ?? null,
        );
        expect(cdf.medianDays).not.toBeNull();
    });

    it('инварианты: F(0) = 0, монотонно, [0; 1], сетка до потолка lag_window_sale_days', () => {
        const cdf = must(poolLagCdf(portals, MATH));
        assertCdfInvariants(cdf);
        // Сетка накрывает самое длинное допустимое окно портала, а не дефолт.
        expect(POOL_LAG_DEFAULTS.gridDays).toBe(
            registryRangeOf('lag_window_sale_days')?.[1],
        );
        expect(POOL_LAG_DEFAULTS.gridDays).toBeGreaterThan(
            LAG_CDF_DEFAULTS.windowDays,
        );
        expect(POOL_LAG_DEFAULTS.gridDays).toBe(180);
        // Экспоненты растут на каждом дне — плато нет, сетка полная.
        expect(cdf.points).toHaveLength(POOL_LAG_DEFAULTS.gridDays + 1);
        expect(cdf.points[cdf.points.length - 1].days).toBe(
            POOL_LAG_DEFAULTS.gridDays,
        );
        expect(
            must(poolLagCdf(portals, { ...MATH, gridDays: 30 })).points,
        ).toHaveLength(31);
    });

    it('cure-форма: порталы с окнами 60 и 90 дней → F(∞) = 1, хвост-плато обрезан', () => {
        const short = lagCdfFromTable(
            [
                { days: 10, value: 0.4 },
                { days: 60, value: 1 },
            ],
            { n: 100 },
        );
        const long = lagCdfFromTable(
            [
                { days: 30, value: 0.5 },
                { days: 90, value: 1 },
            ],
            { n: 100 },
        );
        const cdf = must(
            poolLagCdf(
                [
                    portalOf('w60', { lagCdf: short }),
                    portalOf('w90', { lagCdf: long }),
                ],
                MATH,
            ),
        );
        assertCdfInvariants(cdf);
        // На дефолтной сетке 0…60 пул застыл бы на 0,75 — контракт F(∞) = 1 нарушен.
        expect(cdf.at(60)).toBeCloseTo(0.75, 12);
        expect(cdf.at(89)).toBeCloseTo(0.75, 12);
        expect(cdf.at(90)).toBe(1);
        expect(cdf.at(1000)).toBe(1);
        const last = cdf.points[cdf.points.length - 1];
        expect(last).toEqual({ days: 90, value: 1 });
        expect(cdf.points).toHaveLength(91);
        // До дня 60 пул = (0,4 + 0,5)/2 = 0,45 < 0,5 — медиана на дне 60.
        expect(cdf.at(59)).toBeCloseTo(0.45, 12);
        expect(cdf.medianDays).toBe(60);
    });

    it('между узлами — линейная интерполяция, за сеткой — последнее значение', () => {
        const cdf = must(poolLagCdf(portals, MATH));
        const mid = (cdf.at(10) + cdf.at(11)) / 2;
        expect(cdf.at(10.5)).toBeCloseTo(mid, 12);
        expect(cdf.at(10.25)).toBeLessThan(cdf.at(10.5));
        const last = cdf.points[cdf.points.length - 1].value;
        expect(cdf.at(1000)).toBe(last);
        expect(cdf.at(POOL_LAG_DEFAULTS.gridDays)).toBe(last);
    });

    it('таблицы Каплана–Мейера и ступенчатые таблицы объединяются на общей сетке', () => {
        const random = mulberry32(seedOf('pool-lag', 'km'));
        const lags = Array.from({ length: 60 }, () => ({
            days: Math.floor(random() * 40),
        }));
        const km = must(kaplanMeierLagCdf(lags));
        const table = lagCdfFromTable(
            [
                { days: 7, value: 0.5 },
                { days: 21, value: 1 },
            ],
            { n: 40 },
        );
        const cdf = must(
            poolLagCdf(
                [
                    portalOf('km', { lagCdf: km }),
                    portalOf('table', { lagCdf: table }),
                ],
                MATH,
            ),
        );
        assertCdfInvariants(cdf);
        expect(cdf.n).toBe(km.n + 40);
        expect(cdf.at(7)).toBeCloseTo((km.n * km.at(7) + 40 * 0.5) / cdf.n, 12);
        expect(cdf.at(40)).toBeCloseTo(1, 9);
    });

    it('без пригодных таблиц — null; портал с n = 0 не участвует', () => {
        expect(poolLagCdf([], MATH)).toBeNull();
        expect(poolLagCdf([portalOf('x')], MATH)).toBeNull();
        expect(
            poolLagCdf([portalOf('x', { lagCdf: expWithN(14, 0) })], MATH),
        ).toBeNull();
        const only = must(
            poolLagCdf(
                [
                    portalOf('a', { lagCdf: expWithN(14, 100) }),
                    portalOf('zero', { lagCdf: expWithN(56, 0) }),
                ],
                MATH,
            ),
        );
        expect(only.n).toBe(100);
        expect(only.at(14)).toBeCloseTo(0.5, 12);
        // Таблица с NaN не роняет пул: нечисловое значение считается нулём.
        const broken: LagCdf = { ...expWithN(14, 100), at: () => Number.NaN };
        const mixed = must(
            poolLagCdf(
                [
                    portalOf('a', { lagCdf: expWithN(14, 100) }),
                    portalOf('nan', { lagCdf: broken }),
                ],
                MATH,
            ),
        );
        assertCdfInvariants(mixed);
        expect(mixed.at(14)).toBeCloseTo(0.25, 12);
    });

    it('гейт pool_min_portals: таблица одного портала не выходит в пул', () => {
        expect(POOL_LAG_DEFAULTS.minPortals).toBe(
            registryDefault('pool_min_portals'),
        );
        // Из трёх порталов таблица с n > 0 только у одного — по умолчанию null.
        const single = [
            portalOf('a'),
            portalOf('b', { lagCdf: expWithN(14, 100) }),
            portalOf('c', { lagCdf: expWithN(56, 0) }),
        ];
        expect(poolLagCdf(single)).toBeNull();
        expect(poolLagCdf(single, { minPortals: 1 })).not.toBeNull();
        // Два портала с данными при минимуме 3 — null (вычитанием свой вклад
        // отделился бы от чужого); при минимуме 2 — оценка есть.
        expect(poolLagCdf(portals)).toBeNull();
        expect(poolLagCdf(portals, { minPortals: 3 })).toBeNull();
        expect(poolLagCdf(portals, { minPortals: 2 })?.n).toBe(400);
        const three = [
            ...portals,
            portalOf('c', { lagCdf: expWithN(28, 100) }),
        ];
        expect(poolLagCdf(three)?.n).toBe(500);
    });

    it('детерминизм: сетка и значения совпадают между вызовами', () => {
        const first = must(poolLagCdf(portals, MATH));
        const second = must(poolLagCdf(portals, MATH));
        expect(first.points).toEqual(second.points);
        expect([first.n, first.medianDays, first.kind]).toEqual([
            second.n,
            second.medianDays,
            second.kind,
        ]);
        for (let day = 0; day <= 70; day += 0.5) {
            expect(first.at(day)).toBe(second.at(day));
        }
    });
});

describe('poolLognormal', () => {
    it('n-взвешенные m и v', () => {
        const result = poolLognormal(
            [
                portalOf('a', { lognormal: { m: 1, v: 0.2, n: 100 } }),
                portalOf('b', { lognormal: { m: 3, v: 0.6, n: 300 } }),
                portalOf('c'),
            ],
            2,
        );
        expect(result).toEqual({ m: 2.5, v: 0.5, n: 400 });
    });

    it('без данных или с n ≤ 0 и нечисловыми m/v — null', () => {
        expect(poolLognormal([], 1)).toBeNull();
        expect(poolLognormal([portalOf('a')], 1)).toBeNull();
        expect(
            poolLognormal(
                [portalOf('a', { lognormal: { m: 1, v: 1, n: 0 } })],
                1,
            ),
        ).toBeNull();
        expect(
            poolLognormal(
                [portalOf('a', { lognormal: { m: Number.NaN, v: 1, n: 10 } })],
                1,
            ),
        ).toBeNull();
    });

    it('гейт pool_min_portals: чек одного или двух порталов не выходит в пул', () => {
        const one = [
            portalOf('a'),
            portalOf('b', { lognormal: { m: 3, v: 0.6, n: 300 } }),
            portalOf('c', { lognormal: { m: 1, v: 0.2, n: 0 } }),
        ];
        // По умолчанию минимум — pool_min_portals (3).
        expect(poolLognormal(one)).toBeNull();
        expect(poolLognormal(one, 1)).toEqual({ m: 3, v: 0.6, n: 300 });
        const two = [
            portalOf('a', { lognormal: { m: 1, v: 0.2, n: 100 } }),
            portalOf('b', { lognormal: { m: 3, v: 0.6, n: 300 } }),
        ];
        expect(poolLognormal(two)).toBeNull();
        expect(poolLognormal(two, 3)).toBeNull();
        expect(
            poolLognormal([
                ...two,
                portalOf('c', { lognormal: { m: 2, v: 0.4, n: 100 } }),
            ])?.n,
        ).toBe(500);
    });
});

describe('poolSeasonIndex', () => {
    const indexOf = (shift: number): number[] =>
        Array.from(
            { length: SEASON_INDEX_LENGTH },
            (_, month) => 1 + shift * Math.sin((2 * Math.PI * month) / 12),
        );

    it('гейт pool_min_portals (3): меньше порталов — null', () => {
        expect(POOL_LAG_DEFAULTS.minPortalsSeason).toBe(
            registryDefault('pool_min_portals'),
        );
        const two = [
            portalOf('a', { seasonIndex: indexOf(0.2) }),
            portalOf('b', { seasonIndex: indexOf(0.4) }),
        ];
        expect(poolSeasonIndex(two)).toBeNull();
        expect(poolSeasonIndex(two, 2)).not.toBeNull();
        expect(poolSeasonIndex([])).toBeNull();
    });

    it('среднее по порталам с оценённым индексом, 12 значений', () => {
        const result = poolSeasonIndex([
            portalOf('a', { seasonIndex: indexOf(0.2) }),
            portalOf('b', { seasonIndex: indexOf(0.4) }),
            portalOf('c', { seasonIndex: indexOf(0) }),
            portalOf('none'),
            portalOf('short', { seasonIndex: [1, 1, 1] }),
        ]) as readonly number[];
        expect(result).toHaveLength(12);
        const expected = indexOf(0.2);
        result.forEach((value, month) =>
            expect(value).toBeCloseTo(expected[month], 12),
        );
        expect(isUsableSeasonIndex([1, 1, 1])).toBe(false);
        expect(isUsableSeasonIndex(null)).toBe(false);
        expect(isUsableSeasonIndex(indexOf(0.5))).toBe(true);
        expect(isUsableSeasonIndex([...indexOf(0), Number.NaN].slice(1))).toBe(
            false,
        );
    });

    it('детерминизм', () => {
        const portals = [
            portalOf('a', { seasonIndex: indexOf(0.1) }),
            portalOf('b', { seasonIndex: indexOf(0.3) }),
            portalOf('c', { seasonIndex: indexOf(0.2) }),
        ];
        expect(poolSeasonIndex(portals)).toEqual(poolSeasonIndex(portals));
    });
});
