import 'reflect-metadata';
import type {
    AnalyticsLiteDataset,
    CallReportAnalyticsQueryDto,
} from '@lib/call-lib';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import type { SnapshotEnvelope } from '@lib/sales-ai-analytics';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import type { ManagerStylePayload } from '../domain/assembler/manager-snapshot.types';
import {
    axesOf,
    buildStyleRows,
} from '../domain/assembler/manager-style.assembler';
import { StyleStep, tenureBandsOf } from '../steps/style.step';
import { createStepBus } from '../steps/step.types';
import type { StepBus } from '../steps/step.types';
import type { AiAnalyticsSnapshotUpsertResult } from '../store/ai-analytics-snapshot.store';
import { callsLoaderWith, liteRow } from './fixtures/lite-row.fixture';
import {
    snapshotStoreMock,
    stepContext,
} from './fixtures/manager-snapshot.fixture';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';

/** Стор снапшотов фикстуры глазами этой спеки. */
type SnapshotStore = ReturnType<typeof snapshotStoreMock>;

/** Вид вызова upsert на шаге стиля: конверт снапшота стиля. */
type StyleUpsertMock = jest.Mock<
    Promise<AiAnalyticsSnapshotUpsertResult>,
    [SnapshotEnvelope<ManagerStylePayload>]
>;

/** Вид вызова lite-выборки call-lib: запрос отчёта за окно. */
type LoadLiteMock = jest.Mock<
    Promise<AnalyticsLiteDataset>,
    [CallReportAnalyticsQueryDto]
>;

/**
 * Конверты, ушедшие в стор. Приведение: фикстура snapshotStoreMock общая
 * для всех шагов и её upsert объявлен без дженериков — вид вызова
 * сужается здесь, в спеке шага, который эти конверты и пишет.
 */
const styleUpserts = (
    store: SnapshotStore,
): SnapshotEnvelope<ManagerStylePayload>[] =>
    (store.upsert as StyleUpsertMock).mock.calls.map(([envelope]) => envelope);

/**
 * Запрос первой lite-выборки. Приведение по той же причине: фикстура
 * callsLoaderWith отдаёт jest.Mock без дженериков.
 */
const firstLiteQuery = (loadLite: jest.Mock): CallReportAnalyticsQueryDto =>
    (loadLite as LoadLiteMock).mock.calls[0][0];

/** Разбор с оценёнными разделами «потребности» и «презентация». */
function styleCall(
    id: string,
    managerId: string,
    scores: { needs: number; presentation: number },
): DatedLiteRow {
    return liteRow({
        transcriptionId: id,
        managerId,
        callStartedAt: new Date('2026-08-12T09:00:00Z'),
        sections: [
            {
                section: 'NEEDS',
                relevance: 80,
                score: scores.needs,
                asWas: null,
                alternatives: [],
            },
            {
                section: 'PRESENTATION',
                relevance: 80,
                score: scores.presentation,
                asWas: null,
                alternatives: [],
            },
        ],
    }) as DatedLiteRow;
}

/** n разборов менеджера с заданным контрастом «потребности − презентация». */
function calls(
    managerId: string,
    count: number,
    contrast: number,
): DatedLiteRow[] {
    return Array.from({ length: count }, (_, index) =>
        styleCall(`${managerId}-${index}`, managerId, {
            needs: 5 + contrast,
            presentation: 5,
        }),
    );
}

const monthly = () => stepContext({ rhythm: 'monthly', monthKey: '2026-08' });

/** Шина с паспортами: полосы стажа для оффсета осей. */
function busWithPassport(): StepBus {
    const bus = createStepBus();
    bus.set(AI_PIPELINE_BUS_KEYS.passport, [
        { managerId: '10', tenureBand: '6-18' },
        { managerId: '20', tenureBand: '18+' },
    ]);
    return bus;
}

describe('Единицы осей стиля из разбора', () => {
    it('ось «вопросы против презентации» — контраст разделов рубрики', () => {
        expect(
            axesOf(styleCall('t-1', '10', { needs: 8, presentation: 5 })),
        ).toEqual({ inquiry: 3 });
    });

    it('раздела в разборе нет — ось молчит, ноль не подставляется', () => {
        const row = liteRow({ transcriptionId: 't-1' }) as DatedLiteRow;

        expect(axesOf(row)).toEqual({});
        expect(buildStyleRows([row])).toEqual([]);
    });

    it('строки без менеджера и без разбора в норму не идут', () => {
        const rows = [
            styleCall('t-1', '10', { needs: 8, presentation: 5 }),
            {
                ...styleCall('t-2', '10', { needs: 8, presentation: 5 }),
                managerId: null,
            },
            {
                ...styleCall('t-3', '10', { needs: 8, presentation: 5 }),
                analysisPresent: false,
            },
        ] as DatedLiteRow[];

        expect(buildStyleRows(rows)).toHaveLength(1);
    });

    it('полосы стажа собираются из паспортов шины', () => {
        expect(
            tenureBandsOf([
                { managerId: '10', tenureBand: '6-18' },
                { managerId: '20', tenureBand: null },
            ]),
        ).toEqual({ '10': '6-18' });
    });
});

describe('StyleStep — месячный профиль стиля', () => {
    it('код, ритм и окно в три месяца', async () => {
        const { loader, loadLite } = callsLoaderWith(calls('10', 1, 1));
        const step = new StyleStep(loader, snapshotStoreMock() as never);

        expect(step.code).toBe('style');
        expect(step.rhythms).toEqual(['monthly']);

        await step.run(monthly(), busWithPassport());

        const args = firstLiteQuery(loadLite);
        expect(args.from).toBe('2026-05-31T21:00:00.000Z');
        expect(args.to).toBe('2026-08-31T20:59:59.999Z');
    });

    it('меньше сорока разборов за окно — профиль без доверия и без подписей', async () => {
        const { loader } = callsLoaderWith([
            ...calls('10', 10, 3),
            ...calls('20', 10, 0),
        ]);
        const store = snapshotStoreMock();

        const result = await new StyleStep(loader, store as never).run(
            monthly(),
            busWithPassport(),
        );

        expect(result.status).toBe('ok');
        const written = styleUpserts(store)[0];
        expect(written).toMatchObject({
            type: AI_ANALYTICS_SNAPSHOT_TYPE.style,
            periodKey: '2026-08',
        });
        expect(written.payload.confidence).toBe('none');
        expect(written.payload.confidenceReason).toBe('few-calls');
        expect(written.payload.tags).toEqual([]);
        expect(written.payload.vector).toEqual({});
        expect(written.payload.window).toEqual([
            '2026-06',
            '2026-07',
            '2026-08',
        ]);
    });

    it('профиль каждого менеджера ростера уезжает в шину для месяца', async () => {
        const { loader } = callsLoaderWith(calls('10', 5, 1));
        const bus = busWithPassport();

        await new StyleStep(loader, snapshotStoreMock() as never).run(
            stepContext({
                rhythm: 'monthly',
                monthKey: '2026-08',
                managerIds: [10, 20],
            }),
            bus,
        );

        const entries = bus.get<{ managerId: string }[]>(
            AI_PIPELINE_BUS_KEYS.style,
        );
        expect(entries?.map(entry => entry.managerId)).toEqual(['10', '20']);
    });

    it('в окне нет разборов — шаг пропущен с причиной', async () => {
        const { loader } = callsLoaderWith([]);
        const store = snapshotStoreMock();

        const result = await new StyleStep(loader, store as never).run(
            monthly(),
            createStepBus(),
        );

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe('style-window-empty');
        expect(store.upsert).not.toHaveBeenCalled();
    });

    it('ростер пуст — шаг пропущен, call-lib не зовётся', async () => {
        const { loader, loadLite } = callsLoaderWith(calls('10', 5, 1));

        const result = await new StyleStep(
            loader,
            snapshotStoreMock() as never,
        ).run(
            stepContext({ rhythm: 'monthly', managerIds: [] }),
            createStepBus(),
        );

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe('roster-empty');
        expect(loadLite).not.toHaveBeenCalled();
    });
});
