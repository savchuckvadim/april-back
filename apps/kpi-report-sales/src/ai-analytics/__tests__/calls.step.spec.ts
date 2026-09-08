import 'reflect-metadata';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import type { SnapshotEnvelope } from '@lib/sales-ai-analytics';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import type { ManagerWeekPayload } from '../domain/assembler/manager-snapshot.types';
import { CallsStep, callsWindowOf } from '../steps/calls.step';
import { createStepBus } from '../steps/step.types';
import type { AiPipelineStepContext } from '../steps/step.types';
import type { AiAnalyticsSnapshotUpsertResult } from '../store/ai-analytics-snapshot.store';
import { callsLoaderWith, liteRow } from './fixtures/lite-row.fixture';
import {
    snapshotStoreMock,
    stepContext,
} from './fixtures/manager-snapshot.fixture';

/** Стор снапшотов фикстуры глазами этой спеки. */
type SnapshotStore = ReturnType<typeof snapshotStoreMock>;

/** Вид вызова upsert на шаге звонков: конверт недельного снапшота. */
type WeekUpsertMock = jest.Mock<
    Promise<AiAnalyticsSnapshotUpsertResult>,
    [SnapshotEnvelope<ManagerWeekPayload>]
>;

/**
 * Конверты, ушедшие в стор. Приведение: фикстура snapshotStoreMock общая
 * для всех шагов и её upsert объявлен без дженериков — вид вызова
 * сужается здесь, в спеке шага, который эти конверты и пишет.
 */
const weekUpserts = (
    store: SnapshotStore,
): SnapshotEnvelope<ManagerWeekPayload>[] =>
    (store.upsert as WeekUpsertMock).mock.calls.map(([envelope]) => envelope);

/** Разбор недели 2026-W36 (пн 31.08 — вс 06.09) с оценённым разделом. */
const weekCall = (id: string, iso = '2026-09-02T09:00:00Z') =>
    liteRow({
        transcriptionId: id,
        callStartedAt: new Date(iso),
        sections: [
            {
                section: 'CLOSING',
                relevance: 80,
                score: 8,
                asWas: null,
                alternatives: [],
            },
        ],
    });

const weekly = (overrides: Partial<AiPipelineStepContext> = {}) =>
    stepContext({ rhythm: 'weekly', day: '2026-09-07', ...overrides });

describe('Окно выборки шага звонков', () => {
    it('недельный ритм — закончившаяся ISO-неделя, снапшот недели пишется', () => {
        expect(callsWindowOf(weekly())).toEqual({
            from: '2026-08-31',
            to: '2026-09-06',
            writeWeek: true,
        });
    });

    it('ночной и месячный ритмы — календарный месяц без недельных записей', () => {
        expect(callsWindowOf(stepContext())).toEqual({
            from: '2026-09-01',
            to: '2026-09-30',
            writeWeek: false,
        });
        expect(
            callsWindowOf(stepContext({ rhythm: 'monthly' })).writeWeek,
        ).toBe(false);
    });

    it('догон: день = последний день месяца — джоба месяца, иначе джоба недели', () => {
        expect(
            callsWindowOf(
                stepContext({ rhythm: 'backfill', day: '2026-09-30' }),
            ),
        ).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
        expect(
            callsWindowOf(
                stepContext({
                    rhythm: 'backfill',
                    day: '2026-09-06',
                    weekKey: '2026-W36',
                }),
            ),
        ).toEqual({ from: '2026-08-31', to: '2026-09-06', writeWeek: true });
    });
});

describe('CallsStep — выборка разборов и недельный снапшот', () => {
    it('код и ритмы шага', () => {
        const step = new CallsStep(
            callsLoaderWith([]).loader,
            snapshotStoreMock() as never,
        );

        expect(step.code).toBe('calls');
        expect(step.rhythms).toEqual([
            'nightly',
            'weekly',
            'monthly',
            'backfill',
        ]);
    });

    it('строки кладутся в шину — соседние шаги в call-lib не ходят', async () => {
        const { loader, loadLite } = callsLoaderWith([weekCall('t-1')]);
        const bus = createStepBus();

        await new CallsStep(loader, snapshotStoreMock() as never).run(
            stepContext(),
            bus,
        );

        expect(bus.get(AI_PIPELINE_BUS_KEYS.callsRows)).toHaveLength(1);
        expect(loadLite).toHaveBeenCalledTimes(1);
    });

    it('недельный ритм пишет снапшот недели по ключу ISO-недели', async () => {
        const { loader } = callsLoaderWith([weekCall('t-1'), weekCall('t-2')]);
        const store = snapshotStoreMock();

        const result = await new CallsStep(loader, store as never).run(
            weekly(),
            createStepBus(),
        );

        expect(result.status).toBe('ok');
        expect(result.written).toBe(1);
        expect(store.upsert).toHaveBeenCalledTimes(1);
        expect(weekUpserts(store)[0]).toMatchObject({
            domain: 'a.bitrix24.ru',
            type: AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            periodKey: '2026-W36',
            managerId: '10',
            calcVersion: 'sam-1.0.0',
            paramsVersion: 'pv-1',
        });
    });

    it('повтор за ту же неделю пишет тот же ключ — прежняя запись замещается', async () => {
        const { loader } = callsLoaderWith([weekCall('t-1')]);
        const store = snapshotStoreMock();
        store.upsert.mockResolvedValueOnce({ id: '1', supersededIds: [] });
        store.upsert.mockResolvedValueOnce({ id: '2', supersededIds: ['1'] });
        const step = new CallsStep(loader, store as never);

        await step.run(weekly(), createStepBus());
        await step.run(weekly(), createStepBus());

        const [first, second] = weekUpserts(store);
        expect(second.periodKey).toBe(first.periodKey);
        expect(second.managerId).toBe(first.managerId);
        expect(await store.upsert.mock.results[1].value).toEqual({
            id: '2',
            supersededIds: ['1'],
        });
    });

    it('неделя без разборов записи не создаёт — пропуск с причиной', async () => {
        const { loader } = callsLoaderWith([]);
        const store = snapshotStoreMock();

        const result = await new CallsStep(loader, store as never).run(
            weekly(),
            createStepBus(),
        );

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe('week-no-analysis');
        expect(store.upsert).not.toHaveBeenCalled();
    });

    it('звонки вне недели в недельный снапшот не попадают', async () => {
        const { loader } = callsLoaderWith([
            weekCall('t-1'),
            weekCall('t-old', '2026-08-20T09:00:00Z'),
        ]);
        const store = snapshotStoreMock();

        await new CallsStep(loader, store as never).run(
            weekly(),
            createStepBus(),
        );

        expect(weekUpserts(store)[0].payload.n).toBe(1);
    });

    it('ночной ритм недельных снапшотов не пишет', async () => {
        const { loader } = callsLoaderWith([weekCall('t-1')]);
        const store = snapshotStoreMock();

        const result = await new CallsStep(loader, store as never).run(
            stepContext(),
            createStepBus(),
        );

        expect(result.status).toBe('ok');
        expect(store.upsert).not.toHaveBeenCalled();
    });
});
