import 'reflect-metadata';
import type { AnalyticsCallLiteRow } from '@lib/call-lib';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    type AiPortalDefinitions,
    type AiScoringSettings,
} from '@lib/sales-ai-analytics';
import type { SnapshotEnvelope } from '@lib/sales-ai-analytics';
import { defaultDefinitions } from '@lib/sales-ai-analytics/settings/ai-settings.defaults';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import type { ManagerWeekPayload } from '../domain/assembler/manager-snapshot.types';
import {
    buildManagerWeekPayload,
    emptyWeekPayload,
} from '../domain/assembler/manager-week.assembler';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';
import { portalMinDurationByType } from '../domain/loaders/min-duration.util';
import { CallsStep, callsWindowOf } from '../steps/calls.step';
import { createStepBus } from '../steps/step.types';
import type { AiPipelineStepContext } from '../steps/step.types';
import type { AiAnalyticsSnapshotUpsertResult } from '../store/ai-analytics-snapshot.store';
import {
    callsLoaderWith,
    liteRow,
    portalSettings,
} from './fixtures/lite-row.fixture';
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

/** Конверты стора без привязки к нагрузке (маркер пустой недели). */
const upserts = (store: SnapshotStore): SnapshotEnvelope<unknown>[] =>
    store.upsert.mock.calls.map(
        ([envelope]: [SnapshotEnvelope<unknown>]) => envelope,
    );

/** Разбор недели 2026-W36 (пн 31.08 — вс 06.09) с оценённым разделом. */
const weekCall = (
    id: string,
    iso = '2026-09-02T09:00:00Z',
    overrides: Partial<AnalyticsCallLiteRow> = {},
) =>
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
        ...overrides,
    });

const weekly = (overrides: Partial<AiPipelineStepContext> = {}) =>
    stepContext({ rhythm: 'weekly', day: '2026-09-07', ...overrides });

/** Версии расчёта контекста stepContext() в нагрузке снапшота. */
const META = {
    calcVersion: 'sam-1.0.0',
    paramsVersion: 'pv-1',
    comparableFrom: null,
    generatedAt: '2026-09-08T00:45:00.000Z',
    modelSnapshotId: null,
};

/** Определения портала: базовый порог 300 с, холодный звонок — 60 с. */
const coldLenientDefinitions = (): AiPortalDefinitions => ({
    ...defaultDefinitions(),
    minDurationSecByType: {
        ...defaultDefinitions().minDurationSecByType,
        cold: 60,
    },
});

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

    it('неделя без разборов: строк менеджеров нет, пишется маркер портального зерна', async () => {
        const { loader } = callsLoaderWith([]);
        const store = snapshotStoreMock();

        const result = await new CallsStep(loader, store as never).run(
            weekly(),
            createStepBus(),
        );

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe('week-no-analysis');
        expect(result.written).toBe(1);
        expect(store.upsert).toHaveBeenCalledTimes(1);
        expect(upserts(store)[0]).toMatchObject({
            domain: 'a.bitrix24.ru',
            type: AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            periodKey: '2026-W36',
            managerId: null,
        });
        expect(upserts(store)[0].payload).toEqual(emptyWeekPayload(META));
    });

    it('догон пустой недели: повтор пишет тот же ключ маркера — вторая ночь не считает неделю дырой', async () => {
        const { loader } = callsLoaderWith([]);
        const store = snapshotStoreMock();
        const step = new CallsStep(loader, store as never);
        const backfillWeek = () =>
            stepContext({
                rhythm: 'backfill',
                day: '2026-09-06',
                weekKey: '2026-W36',
            });

        await step.run(backfillWeek(), createStepBus());
        await step.run(backfillWeek(), createStepBus());

        const [first, second] = upserts(store);
        expect(first).toMatchObject({ periodKey: '2026-W36', managerId: null });
        expect(second.periodKey).toBe(first.periodKey);
        expect(second.managerId).toBeNull();
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

/**
 * Порог «разбираемого» звонка — карта по типам из настроек портала, та же,
 * что у пульса (аудит Фазы 2, M2). Скаляр реестра при разных порогах по
 * типам не задан, и прежний путь шага уводил матрицу на дефолт 300 с.
 */
describe('CallsStep — порог длительности по типам звонков', () => {
    const settings = portalSettings({ definitions: coldLenientDefinitions() });
    /** 8 презентаций по 600 с, холодный 90 с и презентация 90 с. */
    const rows = () => [
        ...Array.from({ length: 8 }, (_, index) => weekCall(`p-${index}`)),
        weekCall('cold-90', undefined, { callType: 'cold', durationSec: 90 }),
        weekCall('pres-90', undefined, {
            callType: 'presentation',
            durationSec: 90,
        }),
    ];
    const cellOf = (payload: ManagerWeekPayload, callType: string) =>
        payload.byType.find(cell => cell.callType === callType);

    it('cold 60 / presentation 300: холодный 90 с попадает в неделю, презентация 90 с — нет', async () => {
        const { loader } = callsLoaderWith(rows());
        const store = snapshotStoreMock();

        await new CallsStep(loader, store as never).run(
            weekly({ settings }),
            createStepBus(),
        );

        expect(portalMinDurationByType(settings)).toMatchObject({
            cold: 60,
            presentation: 300,
            default: 300,
        });
        const payload = weekUpserts(store)[0].payload;
        expect(payload.n).toBe(9);
        expect(cellOf(payload, 'cold')?.n).toBe(1);
        expect(cellOf(payload, 'presentation')?.n).toBe(8);
    });

    it('без карты (прежний скалярный путь) холодный 90 с срезался бы дефолтом 300 с', () => {
        const scalarOnly = buildManagerWeekPayload({
            weekKey: '2026-W36',
            rows: rows() as DatedLiteRow[],
            scoring: settings.scoring,
            comparableFrom: null,
            timeZone: 'Europe/Moscow',
            meta: META,
        });

        const payload = scalarOnly.rows[0].payload;
        expect(payload.n).toBe(8);
        expect(cellOf(payload, 'cold')).toBeUndefined();
    });
});

/**
 * Правила портала (`ai_analytics_scoring`) доезжают до недели именно из
 * `ctx.settings.scoring` — проверка на шаге, а не только на ассемблере
 * (аудит Фазы 2, N9).
 */
describe('CallsStep — потолки и стоп-фразы из ctx.settings.scoring', () => {
    const capRules: AiScoringSettings = {
        caps: [
            {
                ruleCode: 'closing-no-next-step-date',
                condition: 'nextStep.date = null',
                section: 'CLOSING',
                maxScore: 5,
                flag: 'no-next-step-date',
            },
        ],
        stopWords: ['я перезвоню'],
    };
    /** 8 разборов без даты следующего шага: закрытие на 9, цитата со стоп-фразой. */
    const rows = () =>
        Array.from({ length: 8 }, (_, index) =>
            weekCall(`t-${index}`, undefined, {
                nextStep: { set: true, date: null },
                sections: [
                    {
                        section: 'CLOSING',
                        relevance: 80,
                        score: 9,
                        asWas: 'Ну это самое, я перезвоню',
                        alternatives: [],
                    },
                ],
            }),
        );
    const closingOf = (payload: ManagerWeekPayload) =>
        payload.byType[0].sections.find(
            section => section.section === 'CLOSING',
        );

    it('потолок «нет даты → CLOSING ≤ 5» режет балл, пишет флаг и стоп-фразу в снапшот', async () => {
        const { loader } = callsLoaderWith(rows());
        const store = snapshotStoreMock();

        await new CallsStep(loader, store as never).run(
            weekly({ settings: portalSettings({ scoring: capRules }) }),
            createStepBus(),
        );

        const payload = weekUpserts(store)[0].payload;
        expect(closingOf(payload)?.avgScore).toBe(
            Math.min(9, capRules.caps[0].maxScore),
        );
        expect(payload.caps).toEqual([
            {
                ruleCode: 'closing-no-next-step-date',
                section: 'CLOSING',
                flag: 'no-next-step-date',
                maxScore: 5,
                calls: 8,
                cut: 8,
            },
        ]);
        expect(payload.flags).toEqual(['no-next-step-date']);
        expect(payload.stopWords).toEqual(['я перезвоню']);
    });

    it('без правил в настройках балл остаётся 9, следа правил нет', async () => {
        const { loader } = callsLoaderWith(rows());
        const store = snapshotStoreMock();

        await new CallsStep(loader, store as never).run(
            weekly(),
            createStepBus(),
        );

        const payload = weekUpserts(store)[0].payload;
        expect(closingOf(payload)?.avgScore).toBe(9);
        expect(payload.caps).toEqual([]);
        expect(payload.flags).toEqual([]);
        expect(payload.stopWords).toEqual([]);
    });
});
