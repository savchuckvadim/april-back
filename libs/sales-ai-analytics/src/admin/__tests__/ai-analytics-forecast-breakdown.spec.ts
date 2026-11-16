import { AI_ANALYTICS_SNAPSHOT_TYPE } from '../../contracts/snapshot-kinds.const';
import type {
    AiAnalyticsAdminSnapshotRecord,
    AiAnalyticsAdminSnapshotStore,
} from '../ai-analytics-admin-snapshot.store';
import {
    toDepartmentBreakdown,
    toManagerBreakdown,
} from '../services/ai-analytics-forecast-breakdown.mapper';
import { AiAnalyticsForecastBreakdownService } from '../services/ai-analytics-forecast-breakdown.service';

const DOMAIN = 'portal.bitrix24.ru';
const NOW = new Date('2026-11-17T06:00:00.000Z');

const record = (
    fields: Partial<AiAnalyticsAdminSnapshotRecord>,
): AiAnalyticsAdminSnapshotRecord => ({
    id: '1',
    type: AI_ANALYTICS_SNAPSHOT_TYPE.forecast,
    domain: DOMAIN,
    periodKey: '2026-11-16',
    managerId: null,
    calcVersion: 'v1',
    paramsVersion: 'p1',
    inputsHash: 'h',
    generatedAt: '2026-11-16T22:00:00.000Z',
    status: 'done',
    createdAt: new Date('2026-11-16T22:00:00.000Z'),
    tokensCount: 0,
    price: 0,
    payload: {},
    ...fields,
});

const logDay = (day: string, fields: Record<string, unknown> = {}) => ({
    day,
    low: 38,
    p50: 46,
    high: 55,
    naive: 44,
    mean3: 41.3,
    done: 21,
    managers: 2,
    pipelineUnknown: 0,
    ...fields,
});

const managerPayload = (fields: Record<string, unknown> = {}) => ({
    p50: 5.4,
    doneSales: 2,
    naive: 4,
    pipelineExpected: 1.1,
    newFlowExpected: 2.3,
    target: { value: 6, source: 'plan', empty: false },
    breakdown: {
        entryDone: 38,
        entryRate: 3.5,
        conversion: 0.06,
        fBar: 0.55,
        openEpisodes: 27,
        topEpisodes: [
            { id: 'deal:1', ageDays: 34, theta: 0.42, expected: 0.18 },
            'мусор',
        ],
    },
    ...fields,
});

function serviceWith(
    log: AiAnalyticsAdminSnapshotRecord[],
    managers: AiAnalyticsAdminSnapshotRecord[],
) {
    const read = jest.fn((_domain: string, types: readonly string[]) =>
        Promise.resolve(
            types.includes(AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog)
                ? log
                : managers,
        ),
    );
    const store = { read } as unknown as AiAnalyticsAdminSnapshotStore;
    return { service: new AiAnalyticsForecastBreakdownService(store), read };
}

describe('разложение прогноза отдела: чтение сохранённого', () => {
    it('отдел: слагаемые из дня журнала — закрыто, открытые сделки, новые встречи', () => {
        const view = toDepartmentBreakdown('2026-11', {
            days: [
                logDay('2026-11-15', { p50: 40 }),
                logDay('2026-11-16', { descriptive: 30.5 }),
                { day: 'битый' },
            ],
        });
        expect(view).toMatchObject({
            day: '2026-11-16',
            monthKey: '2026-11',
            p50: 46,
            done: 21,
            pipeline: 9.5,
            newFlow: 15.5,
            naive: 44,
            mean3: 41.3,
        });
    });

    it('отдел: день до появления разложения — слагаемых нет, итог есть', () => {
        const view = toDepartmentBreakdown('2026-11', {
            days: [logDay('2026-11-10')],
        });
        expect(view).toMatchObject({
            p50: 46,
            done: 21,
            pipeline: null,
            newFlow: null,
        });
        expect(toDepartmentBreakdown('2026-11', { days: [] })).toBeNull();
        expect(toDepartmentBreakdown('2026-11', 'мусор')).toBeNull();
    });

    it('менеджер: слагаемые, входы расчёта и сделки с наибольшим вкладом', () => {
        expect(toManagerBreakdown('15', managerPayload())).toEqual({
            managerId: '15',
            p50: 5.4,
            done: 2,
            pipeline: 1.1,
            newFlow: 2.3,
            naive: 4,
            target: 6,
            entryDone: 38,
            entryRate: 3.5,
            conversion: 0.06,
            fBar: 0.55,
            openEpisodes: 27,
            topEpisodes: [
                { id: 'deal:1', ageDays: 34, theta: 0.42, expected: 0.18 },
            ],
        });
    });

    it('менеджер: старая запись без входов, пустая цель, нет истории стадий', () => {
        const view = toManagerBreakdown(
            '15',
            managerPayload({
                breakdown: undefined,
                pipelineExpected: null,
                target: { value: 0, source: 'none', empty: true },
            }),
        );
        expect(view).toMatchObject({
            pipeline: null,
            target: null,
            entryDone: null,
            openEpisodes: null,
            topEpisodes: [],
        });
        expect(toManagerBreakdown('15', { p50: 'нет' })).toBeNull();
    });

    it('сервис: последний день журнала и прогнозы менеджеров за этот день, крупные первыми', async () => {
        const { service, read } = serviceWith(
            [
                record({
                    type: AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
                    periodKey: '2026-11',
                    payload: {
                        days: [logDay('2026-11-16', { descriptive: 30.5 })],
                    },
                }),
                record({
                    type: AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
                    periodKey: '2026-10',
                    payload: { days: [logDay('2026-10-31')] },
                }),
            ],
            [
                record({ id: '2', managerId: '15', payload: managerPayload() }),
                record({
                    id: '3',
                    managerId: '20',
                    payload: managerPayload({ p50: 9 }),
                }),
                // Прежняя запись того же менеджера за день — берётся новая.
                record({
                    id: '4',
                    managerId: '20',
                    createdAt: new Date('2026-11-16T10:00:00.000Z'),
                    payload: managerPayload({ p50: 1 }),
                }),
                // Замещённая и запись другого дня в разложение не идут.
                record({
                    id: '5',
                    managerId: '30',
                    status: 'superseded',
                    payload: managerPayload({ p50: 99 }),
                }),
                record({
                    id: '6',
                    managerId: '40',
                    periodKey: '2026-11-15',
                    payload: managerPayload({ p50: 99 }),
                }),
            ],
        );
        const view = await service.breakdown(DOMAIN, NOW);
        expect(view.day).toBe('2026-11-16');
        expect(view.department?.pipeline).toBe(9.5);
        expect(view.managers.map(item => [item.managerId, item.p50])).toEqual([
            ['20', 9],
            ['15', 5.4],
        ]);
        // Прогнозы менеджеров читаются узким окном вокруг дня журнала.
        const [, , window] = read.mock.calls[1] as unknown as [
            string,
            string[],
            { from: Date; to: Date },
        ];
        expect(window.from.toISOString()).toBe('2026-11-15T00:00:00.000Z');
        expect(window.to.toISOString()).toBe('2026-11-18T00:00:00.000Z');
    });

    it('сервис: журнала нет — пустое разложение, менеджеров не читаем', async () => {
        const { service, read } = serviceWith([], []);
        expect(await service.breakdown(DOMAIN, NOW)).toEqual({
            domain: DOMAIN,
            day: null,
            department: null,
            managers: [],
        });
        expect(read).toHaveBeenCalledTimes(1);
    });
});
