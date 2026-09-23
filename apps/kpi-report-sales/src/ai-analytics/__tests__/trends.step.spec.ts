import 'reflect-metadata';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
    type SnapshotEnvelope,
} from '@lib/sales-ai-analytics';
import {
    AI_TREND_REASONS,
    AI_TREND_STEP_CODE,
    AI_TREND_STEP_RHYTHMS,
    trendWeekKeys,
} from '../constants/ai-trend.const';
import type { ManagerTrendsPayload } from '../domain/assembler/trends.types';
import type { AiAnalyticsSnapshotRecord } from '../store/ai-analytics-snapshot.store';
import { TrendsStep, trendRecordsOf } from '../steps/trends.step';
import { stepContext } from './fixtures/manager-snapshot.fixture';
import {
    TRENDS_MONTH_KEYS,
    TRENDS_WEEK_KEY,
    TRENDS_WEEK_KEYS,
    emptyWeekStoreRecord,
    monthRecords,
    storeRecord,
    weekRecords,
    weekScores,
} from './fixtures/trends.fixture';

/**
 * Недельный шаг трендов (план Фазы 3, П1): читает недели и закрытые
 * месяцы по ключам, пропускается с причиной при пустом ростере, пустом
 * окне и нехватке разборов, пишет `ai-analytics-trends` за неделю.
 */
type UpsertMock = jest.Mock<
    Promise<{ id: string; supersededIds: string[]; written: 1 }>,
    [SnapshotEnvelope<ManagerTrendsPayload>]
>;

function storeWith(
    weeks: AiAnalyticsSnapshotRecord[] = [],
    months: AiAnalyticsSnapshotRecord[] = [],
) {
    const findByKeys = jest.fn().mockResolvedValue(weeks);
    const findManagerMonths = jest.fn().mockResolvedValue(months);
    const upsert = jest.fn().mockResolvedValue({
        id: 'ais-1',
        supersededIds: [],
        written: 1,
    }) as UpsertMock;

    return { findByKeys, findManagerMonths, upsert };
}

/** Прогон понедельника 21.09.2026 по закончившейся неделе W38. */
const weekly = (managerIds: number[] = [10, 20]) =>
    stepContext({
        rhythm: 'weekly',
        day: '2026-09-21',
        weekKey: TRENDS_WEEK_KEY,
        monthKey: '2026-09',
        managerIds,
        now: new Date('2026-09-21T00:15:00Z'),
    });

const weekStore = (managerId: string, scores: readonly number[]) =>
    weekRecords(managerId, scores).map(record =>
        storeRecord(AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek, record),
    );

describe('TrendsStep — недельный шаг трендов', () => {
    it('код, ритм weekly, Битрикс не зовётся', () => {
        const step = new TrendsStep(storeWith() as never);
        expect(step.code).toBe(AI_TREND_STEP_CODE);
        expect(step.rhythms).toEqual(AI_TREND_STEP_RHYTHMS);
        expect(step.rhythms).toEqual(['weekly']);
    });

    it('ростер пуст — пропуск, стор не читается', async () => {
        const store = storeWith();
        const result = await new TrendsStep(store as never).run(weekly([]));
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_TREND_REASONS.rosterEmpty);
        expect(store.findByKeys).not.toHaveBeenCalled();
    });

    it('читает 26 недель по ключам (последняя — неделя прогона) и 12 закрытых месяцев', async () => {
        const store = storeWith();
        await new TrendsStep(store as never).run(weekly());
        const [domain, type, filter] = store.findByKeys.mock.calls[0] as [
            string,
            string,
            { periodKeys: string[]; latestOnly: boolean },
        ];
        expect(domain).toBe('a.bitrix24.ru');
        expect(type).toBe(AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek);
        expect(filter.latestOnly).toBe(true);
        expect(filter.periodKeys).toEqual(trendWeekKeys(TRENDS_WEEK_KEY, 26));
        expect(filter.periodKeys).toHaveLength(26);
        expect(filter.periodKeys[25]).toBe(TRENDS_WEEK_KEY);
        expect(filter.periodKeys[0]).toBe('2026-W13');
        expect(store.findManagerMonths).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            TRENDS_MONTH_KEYS,
            {
                limit: AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
                managerIds: ['10', '20'],
            },
        );
    });

    it('в окне только маркеры пустых недель — пропуск trends-window-empty', async () => {
        const store = storeWith(TRENDS_WEEK_KEYS.map(emptyWeekStoreRecord));
        const result = await new TrendsStep(store as never).run(weekly());
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_TREND_REASONS.windowEmpty);
        expect(store.upsert).not.toHaveBeenCalled();
    });

    it('разборов меньше trend_window_calls у всех — пропуск trends-few-calls, записей нет', async () => {
        const store = storeWith(weekStore('10', weekScores('m10').slice(0, 2)));
        const result = await new TrendsStep(store as never).run(weekly([10]));
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_TREND_REASONS.fewCalls);
        expect(result.rows).toBe(2);
        expect(store.upsert).not.toHaveBeenCalled();
    });

    it('порог реестра портала снижает гейт: те же две недели пишутся', async () => {
        const store = storeWith(weekStore('10', weekScores('m10').slice(0, 2)));
        const result = await new TrendsStep(store as never).run({
            ...weekly([10]),
            registry: { portal: { trend_window_calls: 20 } },
        });
        expect(result.status).toBe('ok');
        expect(result.written).toBe(1);
    });

    it('пишет ai-analytics-trends за неделю по каждому менеджеру с разборами; чужие менеджеры отброшены', async () => {
        const store = storeWith(
            [
                ...weekStore('10', weekScores('m10', 13, 2)),
                ...weekStore('20', weekScores('m20')),
                ...weekStore('99', weekScores('m99')),
            ],
            monthRecords(
                '20',
                [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.6, 0.6, 0.6],
            ).map(record =>
                storeRecord(AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth, record),
            ),
        );
        const ctx = weekly();
        const result = await new TrendsStep(store as never).run(ctx);
        expect(result.status).toBe('ok');
        expect(result.rows).toBe(52 + 12);
        expect(result.written).toBe(2);
        expect(result.bitrixCalls).toBe(0);
        const envelopes = store.upsert.mock.calls.map(([envelope]) => envelope);
        expect(envelopes.map(envelope => envelope.managerId)).toEqual([
            '10',
            '20',
        ]);
        for (const envelope of envelopes) {
            expect(envelope).toMatchObject({
                domain: ctx.domain,
                type: AI_ANALYTICS_SNAPSHOT_TYPE.trends,
                periodKey: TRENDS_WEEK_KEY,
                calcVersion: ctx.calcVersion,
                paramsVersion: ctx.paramsVersion,
                inputsHash: ctx.inputsHash,
                generatedAt: ctx.now.toISOString(),
            });
            expect(envelope.payload.meta.comparableFrom).toBeNull();
            expect(envelope.payload.window.months).toEqual(TRENDS_MONTH_KEYS);
        }
        const [ten, twenty] = envelopes;
        expect(ten.payload.signals[0]).toMatchObject({
            kind: 'shift',
            metric: 'quality',
            direction: 'up',
        });
        expect(
            twenty.payload.signals.find(
                signal => signal.metric === 'edge_call_to_presentation',
            ),
        ).toMatchObject({ kind: 'shift', grain: 'month', direction: 'up' });
    });

    it('trendRecordsOf: портальные маркеры и менеджеры вне ростера отбрасываются', () => {
        const records = [
            emptyWeekStoreRecord('2026-W38'),
            ...weekStore('10', [6]),
            ...weekStore('99', [6]),
        ];
        expect(trendRecordsOf(records, new Set(['10']))).toEqual([
            {
                periodKey: TRENDS_WEEK_KEY,
                managerId: '10',
                payload: records[1].payload,
            },
        ]);
    });
});
