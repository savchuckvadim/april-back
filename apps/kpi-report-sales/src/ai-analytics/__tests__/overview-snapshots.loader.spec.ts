import {
    monthKeyOf,
    OverviewSnapshotsLoader,
    previousMonthKey,
    trendWeekKeys,
} from '../domain/loaders/overview-snapshots.loader';
import type {
    AiAnalyticsSnapshotRecord,
    AiAnalyticsSnapshotStore,
} from '../store/ai-analytics-snapshot.store';

/**
 * Загрузчик снапшотов Фазы 2 для витрины обзора (поток 16b): по каким
 * ключам периодов читаются модель портала, дневные прогнозы, профили
 * стиля и (Фаза 3, П1) недельные тренды, и что происходит, когда записей
 * нет.
 */
const DOMAIN = 'a.bitrix24.ru';
const TO = '2026-09-09';

/** Запись стора в объёме, который читает загрузчик. */
function record(
    type: string,
    periodKey: string,
    managerId: string | null,
    payload: Record<string, unknown>,
    createdAt = '2026-09-09T01:00:00Z',
): AiAnalyticsSnapshotRecord {
    return {
        id: `ais-${type}-${periodKey}-${managerId ?? 'portal'}`,
        domain: DOMAIN,
        type: type as AiAnalyticsSnapshotRecord['type'],
        periodKey,
        managerId,
        calcVersion: 'v1',
        paramsVersion: 'pv-1',
        inputsHash: 'h',
        generatedAt: createdAt,
        createdAt: new Date(createdAt),
        status: 'done',
        payload,
    };
}

type Query = { type: string; periodKeys: readonly string[] };

/** Стор, отдающий заранее заданные записи и запоминающий запросы. */
function storeWith(
    byType: Record<string, AiAnalyticsSnapshotRecord[]>,
    latest: AiAnalyticsSnapshotRecord | null = null,
): { store: AiAnalyticsSnapshotStore; queries: Query[] } {
    const queries: Query[] = [];
    const store = {
        findByKeys: jest.fn(
            (
                unusedDomain: string,
                type: string,
                filter: { periodKeys?: readonly string[] },
            ) => {
                queries.push({ type, periodKeys: filter.periodKeys ?? [] });
                return Promise.resolve(byType[type] ?? []);
            },
        ),
        latest: jest.fn(() => Promise.resolve(latest)),
    };

    return { store: store as unknown as AiAnalyticsSnapshotStore, queries };
}

describe('ключи периодов', () => {
    it('месяц даты и предыдущий месяц через границу года', () => {
        expect(monthKeyOf(TO)).toBe('2026-09');
        expect(previousMonthKey('2026-09')).toBe('2026-08');
        expect(previousMonthKey('2026-01')).toBe('2025-12');
        expect(previousMonthKey('нет')).toBe('нет');
    });

    it('тренды ищутся под прошлой и текущей ISO-неделей дня окончания', () => {
        // 09.09.2026 — среда 37-й недели; неделей раньше — 36-я.
        expect(trendWeekKeys(TO)).toEqual(['2026-W36', '2026-W37']);
    });
});

describe('OverviewSnapshotsLoader — что читается из ais', () => {
    it('модель за месяц окончания, прогнозы за два дня, стиль за два месяца', async () => {
        const { store, queries } = storeWith({
            'ai-analytics-portal-model': [
                record('ai-analytics-portal-model', '2026-09', null, {
                    edges: [],
                }),
            ],
            'ai-analytics-forecast': [
                record('ai-analytics-forecast', TO, '10', { doneSales: 4 }),
            ],
            'ai-analytics-style': [
                record('ai-analytics-style', '2026-09', '10', { calls: 62 }),
            ],
        });

        const result = await new OverviewSnapshotsLoader(store).load(
            DOMAIN,
            TO,
        );

        expect(queries).toEqual([
            {
                type: 'ai-analytics-portal-model',
                periodKeys: ['2026-09', '2026-08'],
            },
            {
                type: 'ai-analytics-forecast',
                periodKeys: ['2026-09-08', TO],
            },
            {
                type: 'ai-analytics-style',
                periodKeys: ['2026-08', '2026-09'],
            },
            {
                type: 'ai-analytics-trends',
                periodKeys: ['2026-W36', '2026-W37'],
            },
        ]);
        expect(result.model).toEqual({ edges: [] });
        expect(result.forecasts?.get('10')).toEqual({ doneSales: 4 });
        expect(result.styles?.get('10')).toEqual({ calls: 62 });
        expect(result.trends?.size).toBe(0);
    });

    it('тренды: из двух недель побеждает более поздняя, даже если записана раньше', async () => {
        const { store } = storeWith({
            'ai-analytics-trends': [
                record(
                    'ai-analytics-trends',
                    '2026-W37',
                    '10',
                    { weekKey: '2026-W37', calls: 41 },
                    '2026-09-07T01:00:00Z',
                ),
                record(
                    'ai-analytics-trends',
                    '2026-W36',
                    '10',
                    { weekKey: '2026-W36', calls: 38 },
                    '2026-09-08T01:00:00Z',
                ),
                record('ai-analytics-trends', '2026-W36', '20', {
                    weekKey: '2026-W36',
                    calls: 12,
                }),
            ],
        });

        const result = await new OverviewSnapshotsLoader(store).load(
            DOMAIN,
            TO,
        );

        expect(result.trends?.get('10')).toEqual({
            weekKey: '2026-W37',
            calls: 41,
        });
        expect(result.trends?.get('20')).toEqual({
            weekKey: '2026-W36',
            calls: 12,
        });
    });

    it('модель своего месяца выигрывает у записи прошлого месяца, созданной позже', async () => {
        const { store } = storeWith({
            'ai-analytics-portal-model': [
                record(
                    'ai-analytics-portal-model',
                    '2026-09',
                    null,
                    { monthKey: '2026-09' },
                    '2026-09-01T01:00:00Z',
                ),
                record(
                    'ai-analytics-portal-model',
                    '2026-08',
                    null,
                    { monthKey: '2026-08' },
                    '2026-09-08T01:00:00Z',
                ),
            ],
        });

        const result = await new OverviewSnapshotsLoader(store).load(
            DOMAIN,
            TO,
        );

        expect(result.model).toEqual({ monthKey: '2026-09' });
    });

    it('за свой месяц модели нет — берётся прошлый месяц окна', async () => {
        const { store } = storeWith({
            'ai-analytics-portal-model': [
                record('ai-analytics-portal-model', '2026-08', null, {
                    monthKey: '2026-08',
                }),
            ],
        });

        const result = await new OverviewSnapshotsLoader(store).load(
            DOMAIN,
            TO,
        );

        expect(result.model).toEqual({ monthKey: '2026-08' });
    });

    it('в окне моделей нет — запасной путь «последняя записанная»', async () => {
        const { store } = storeWith(
            {},
            record('ai-analytics-portal-model', '2026-05', null, {
                monthKey: '2026-05',
            }),
        );

        const result = await new OverviewSnapshotsLoader(store).load(
            DOMAIN,
            TO,
        );

        expect(result.model).toEqual({ monthKey: '2026-05' });
    });

    it('снапшотов нет вовсе — витрина остаётся в поведении Фазы 1b', async () => {
        const { store } = storeWith({});

        const result = await new OverviewSnapshotsLoader(store).load(
            DOMAIN,
            TO,
        );

        expect(result.model).toBeNull();
        expect(result.forecasts?.size).toBe(0);
        expect(result.styles?.size).toBe(0);
    });

    it('прогноз за сегодня побеждает вчерашний, портальные записи не берутся', async () => {
        const { store } = storeWith({
            'ai-analytics-forecast': [
                record(
                    'ai-analytics-forecast',
                    '2026-09-08',
                    '10',
                    { doneSales: 3 },
                    '2026-09-08T01:00:00Z',
                ),
                record(
                    'ai-analytics-forecast',
                    TO,
                    '10',
                    { doneSales: 5 },
                    '2026-09-09T01:00:00Z',
                ),
                record('ai-analytics-forecast', TO, null, { doneSales: 99 }),
            ],
        });

        const result = await new OverviewSnapshotsLoader(store).load(
            DOMAIN,
            TO,
        );

        expect(result.forecasts?.size).toBe(1);
        expect(result.forecasts?.get('10')).toEqual({ doneSales: 5 });
    });
});
