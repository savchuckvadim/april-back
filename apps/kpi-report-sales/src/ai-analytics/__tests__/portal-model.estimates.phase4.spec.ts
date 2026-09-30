import {
    registryDefault,
    shrinkWeight,
    type SaleLag,
} from '@lib/sales-ai-analytics';
import {
    AI_PORTAL_SEASON_NOTES,
    lagPhase4Of,
    monthlySalesRatesOf,
    poolLagTableOf,
    seasonPhase4Of,
    usablePool,
} from '../domain/assembler/portal-model.estimates.phase4';
import { checkPhase4Of } from '../domain/assembler/portal-model.check.phase4';
import { poolLognormalOf } from '../domain/loaders/pool-portals.facts';
import type { PortalManagerMonth } from '../domain/assembler/portal-model.types';
import { poolSnapshot } from './fixtures/phase4-snapshots.fixture';

/**
 * Оценки Фазы 4 модели портала (план §4.7, §4.8): ступени таблицы лага
 * (экспонента → Каплан–Мейер → портал с усадкой к пулу), гибрид медианы
 * цикла, сезон по темпам продаж на отработанный день и логнормальный чек.
 */

/** n закрытых продаж с лагами 1..n дней (все в окне 60 дней по модулю). */
const lags = (n: number): SaleLag[] =>
    Array.from({ length: n }, (unused, index) => ({
        days: 1 + (index % 50),
    }));

const month = (
    monthKey: string,
    managerId: string,
    values: Partial<PortalManagerMonth> = {},
): PortalManagerMonth => ({
    monthKey,
    managerId,
    tenureBand: null,
    edges: [],
    excludeFromNorms: false,
    workedDays: 20,
    daysSource: 'calendar',
    callsDone: 100,
    presentations: 10,
    salesCount: 2,
    averageCheck: 50_000,
    planSales: null,
    level: null,
    score: null,
    ...values,
});

const KAPPA = registryDefault('lag_cdf_kappa');

describe('lagPhase4Of: таблица лага и медиана цикла', () => {
    it('продаж нет — экспонента на прайоре медианы', () => {
        const result = lagPhase4Of([], 24, {}, null);
        expect(result.cycleMedianDays).toBe(
            registryDefault('cycle_median_days'),
        );
        expect(result.lagCdf.kind).toBe('exponential');
        expect(result.shrink).toMatchObject({
            source: 'exponential',
            w: 0,
            sales: 0,
            cycleMedianW: 0,
            poolN: null,
        });
    });

    it('до 30 продаж — экспонента на гибридной медиане', () => {
        const result = lagPhase4Of(lags(20), 20, {}, null);
        const w = shrinkWeight(20, KAPPA);
        expect(result.cycleMedianDays).toBeCloseTo(
            w * 20 + (1 - w) * registryDefault('cycle_median_days'),
            9,
        );
        expect(result.shrink.source).toBe('exponential');
    });

    it('от 30 продаж — Каплан–Мейер без усадки', () => {
        const result = lagPhase4Of(lags(40), null, {}, poolSnapshot());
        expect(result.shrink).toMatchObject({
            source: 'kaplan-meier',
            w: 1,
            sales: 40,
        });
    });

    it('от гейта портальной таблицы — усадка к таблице пула', () => {
        const n = registryDefault('lag_cdf_portal_min_n') + 20;
        const result = lagPhase4Of(lags(n), null, {}, poolSnapshot());
        expect(result.shrink.source).toBe('shrunk');
        expect(result.shrink.w).toBeCloseTo(shrinkWeight(n, KAPPA), 12);
        expect(result.shrink.poolN).toBe(400);
        expect(result.lagCdf.points.length).toBeGreaterThan(0);
    });

    it('от гейта без пула — портальная таблица как есть', () => {
        const n = registryDefault('lag_cdf_portal_min_n');
        const result = lagPhase4Of(lags(n), null, {}, null);
        expect(result.shrink).toMatchObject({ source: 'portal', w: 1 });
    });

    it('неоценённый пул не даёт таблицы', () => {
        expect(
            poolLagTableOf(poolSnapshot({ status: 'insufficient' })),
        ).toBeNull();
        expect(usablePool(undefined)).toBeNull();
        expect(poolLagTableOf(poolSnapshot())?.n).toBe(400);
    });
});

describe('seasonPhase4Of: сезонный индекс', () => {
    const months = ['2026-07', '2026-08', '2026-09'].map(key =>
        month(key, '1'),
    );

    it('история короче гейта и пула нет — единицы с подписью «не оценена»', () => {
        const result = seasonPhase4Of(months, '2026-09', {}, null);
        expect(result.index.source).toBe('default');
        expect(result.index.index).toEqual(Array.from({ length: 12 }, () => 1));
        expect(result.season).toEqual({
            index: 1,
            source: 'default',
            note: AI_PORTAL_SEASON_NOTES.notEstimated,
        });
    });

    it('история короче гейта, есть пул — индекс пула, множитель месяца модели', () => {
        const result = seasonPhase4Of(months, '2026-03', {}, poolSnapshot());
        expect(result.index.source).toBe('pooled');
        expect(result.season.source).toBe('estimated');
        expect(result.season.index).toBeCloseTo(result.index.index[2], 12);
    });

    it('темп продаж отдела на отработанный день по месяцам', () => {
        expect(
            monthlySalesRatesOf([
                month('2026-08', '1', { salesCount: 4, workedDays: 20 }),
                month('2026-08', '2', { salesCount: 2, workedDays: 10 }),
                month('2026-07', '1', { salesCount: 1, workedDays: 0 }),
            ]),
        ).toEqual([{ monthKey: '2026-08', ratePerWorkday: 0.2 }]);
    });
});

describe('checkPhase4Of: логнормальный чек', () => {
    it('продаж меньше гейта — значения реестра', () => {
        const result = checkPhase4Of([month('2026-09', '1')], null, {});
        expect(result).toMatchObject({
            source: 'default',
            n: 2,
            w: 0,
            priorFromPool: false,
            m: registryDefault('check_lognormal_m'),
        });
    });

    it('средний чек повторяется по числу продаж, прайор — чек пула', () => {
        const months = Array.from({ length: 10 }, (unused, index) =>
            month('2026-09', String(index), {
                averageCheck: 40_000 + index * 5_000,
            }),
        );
        const result = checkPhase4Of(months, poolSnapshot(), {});
        expect(result.n).toBe(20);
        expect(result.priorFromPool).toBe(true);
        expect(result.source).toBe('shrunk');
        expect(result.w).toBeGreaterThan(0);
        expect(result.w).toBeLessThan(1);
    });

    it('месяцы без чека или без продаж не входят', () => {
        const result = checkPhase4Of(
            [
                month('2026-09', '1', { averageCheck: null }),
                month('2026-09', '2', { salesCount: 0 }),
            ],
            null,
            {},
        );
        expect(result.n).toBe(0);
    });
});

describe('checkPhase4Of: переопределение портала и собственная оценка', () => {
    const OVERRIDE_M = Math.log(300_000);
    const registry = { portal: { check_lognormal_m: OVERRIDE_M } };

    it('продаж меньше гейта, пула нет — прайор из переопределения портала', () => {
        const result = checkPhase4Of([month('2026-09', '1')], null, registry);
        expect(result.source).toBe('default');
        expect(result.m).toBeCloseTo(OVERRIDE_M, 10);
        expect(result.priorFromPool).toBe(false);
        expect(result.own).toBeNull();
    });

    it('переопределение портала сильнее прайора пула', () => {
        const result = checkPhase4Of(
            [month('2026-09', '1')],
            poolSnapshot(),
            registry,
        );
        expect(result.m).toBeCloseTo(OVERRIDE_M, 10);
        expect(result.priorFromPool).toBe(false);
    });

    it('30 продаж — собственная несжатая оценка попадает во вход пула', () => {
        const months = Array.from({ length: 15 }, (unused, index) =>
            month('2026-09', String(index), {
                averageCheck: 40_000 + index * 5_000,
            }),
        );
        const result = checkPhase4Of(months, null, {});
        const logs = months.flatMap(item => [
            Math.log(item.averageCheck ?? 1),
            Math.log(item.averageCheck ?? 1),
        ]);
        const mean = logs.reduce((sum, value) => sum + value, 0) / logs.length;

        expect(result.source).toBe('shrunk');
        expect(result.own?.n).toBe(30);
        expect(result.own?.m).toBeCloseTo(mean, 10);
        expect(poolLognormalOf({ checkLognormal: { ...result } })).toEqual(
            result.own,
        );
    });
});

describe('seasonPhase4Of: выборка глубиной гейта', () => {
    /** 36 месяцев подряд с сезонным темпом: декабрь вдвое выше. */
    const deep = Array.from({ length: 36 }, (unused, index) => {
        const date = new Date(Date.UTC(2023, 9 + index, 1));
        const key = date.toISOString().slice(0, 7);
        return month(key, '1', {
            salesCount: key.endsWith('-12') ? 8 : 4,
            workedDays: 20,
        });
    });

    it('36 месяцев — своя оценка и собственный индекс для пула', () => {
        const result = seasonPhase4Of(deep, '2026-09', {}, null);
        expect(result.index.source).toBe('estimated');
        expect(result.index.own).toHaveLength(12);
        expect(result.index.index[11]).toBeGreaterThan(1);
    });

    it('окна норм (12 месяцев) гейту мало — своей оценки нет', () => {
        const result = seasonPhase4Of(deep.slice(-12), '2026-09', {}, null);
        expect(result.index.source).toBe('default');
        expect(result.index.own).toBeNull();
    });
});
