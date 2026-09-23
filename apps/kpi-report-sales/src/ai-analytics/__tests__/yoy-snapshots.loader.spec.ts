import {
    OverviewSnapshotsLoader,
    YOY_MONTHS_LIMIT,
    yearAgoMonthKey,
} from '../domain/loaders/overview-snapshots.loader';
import type {
    AiAnalyticsSnapshotRecord,
    AiAnalyticsSnapshotStore,
} from '../store/ai-analytics-snapshot.store';

/**
 * Чтение месяцев M и M−12 для блока «год назад» (план Фазы 3, П3):
 * ключи выборки, раскладка записей по менеджерам и поведение, когда
 * истории год назад нет.
 */
const DOMAIN = 'a.bitrix24.ru';

/** Запись `manager-month` в объёме, который читает загрузчик. */
function monthRecord(
    periodKey: string,
    managerId: string,
    analyzed: number,
): AiAnalyticsSnapshotRecord {
    return {
        id: `ais-${periodKey}-${managerId}`,
        domain: DOMAIN,
        type: 'ai-analytics-manager-month' as AiAnalyticsSnapshotRecord['type'],
        periodKey,
        managerId,
        calcVersion: 'v1',
        paramsVersion: 'pv-1',
        inputsHash: 'h',
        generatedAt: '2026-09-30T01:00:00Z',
        createdAt: new Date('2026-09-30T01:00:00Z'),
        status: 'done',
        payload: {
            byType: [
                {
                    callType: 'presentation',
                    n: analyzed,
                    score: { value: 7, n: analyzed },
                },
            ],
            finance: { salesSum: 0, salesCount: 0, averageCheck: null },
        },
    };
}

type Call = { monthKeys: readonly string[]; limit: number };

/** Стор `manager-month`, запоминающий запрошенные ключи и limit. */
function storeWith(records: readonly AiAnalyticsSnapshotRecord[]): {
    store: AiAnalyticsSnapshotStore;
    calls: Call[];
} {
    const calls: Call[] = [];
    const store = {
        findManagerMonths: jest.fn(
            (
                unusedDomain: string,
                monthKeys: readonly string[],
                options: { limit: number },
            ) => {
                calls.push({ monthKeys, limit: options.limit });

                return Promise.resolve(
                    records.filter(record =>
                        monthKeys.includes(record.periodKey),
                    ),
                );
            },
        ),
    } as unknown as AiAnalyticsSnapshotStore;

    return { store, calls };
}

describe('yearAgoMonthKey', () => {
    it('месяц минус год; не месяц — пары нет', () => {
        expect(yearAgoMonthKey('2026-09')).toBe('2025-09');
        expect(yearAgoMonthKey('2026-01')).toBe('2025-01');
        expect(yearAgoMonthKey('2026-W38')).toBeNull();
    });
});

describe('OverviewSnapshotsLoader.loadYoy', () => {
    it('читает оба месяца одной выборкой по ключам и раскладывает по менеджерам', async () => {
        const { store, calls } = storeWith([
            monthRecord('2026-09', '512', 40),
            monthRecord('2025-09', '512', 30),
            monthRecord('2025-09', '447', 20),
        ]);
        const result = await new OverviewSnapshotsLoader(store).loadYoy(
            DOMAIN,
            '2026-09-30',
        );
        expect(calls).toHaveLength(1);
        expect(calls[0].monthKeys).toEqual(['2025-09', '2026-09']);
        expect(calls[0].limit).toBe(YOY_MONTHS_LIMIT * 2);
        expect(result.monthKey).toBe('2026-09');
        expect(result.baseMonthKey).toBe('2025-09');
        expect([...result.months.keys()]).toEqual(['512']);
        expect([...result.baseMonths.keys()].sort()).toEqual(['447', '512']);
    });

    it('истории M−12 нет: месяц витрины прочитан, базовых месяцев нет', async () => {
        const { store } = storeWith([monthRecord('2026-09', '512', 40)]);
        const result = await new OverviewSnapshotsLoader(store).loadYoy(
            DOMAIN,
            '2026-09-30',
        );
        expect(result.months.size).toBe(1);
        expect(result.baseMonths.size).toBe(0);
    });

    it('месяц берётся по дате окончания периода, а не по его началу', async () => {
        const { store, calls } = storeWith([]);
        const result = await new OverviewSnapshotsLoader(store).loadYoy(
            DOMAIN,
            '2026-03-15',
        );
        expect(result.monthKey).toBe('2026-03');
        expect(calls[0].monthKeys).toEqual(['2025-03', '2026-03']);
    });
});
