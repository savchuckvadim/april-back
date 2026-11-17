import 'reflect-metadata';
import type { SnapshotEnvelope } from '@lib/sales-ai-analytics';
import { AI_PORTAL_MODEL_REASONS } from '../constants/ai-portal-model.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import type { ForecastPayload } from '../domain/assembler/forecast.assembler';
import type {
    PortalManagerMonth,
    PortalModelPayload,
} from '../domain/assembler/portal-model.types';
import type { PortalModelRecord } from '../domain/loaders/portal-model.loader';
import { workdaysOf } from '../steps/forecast.facts';
import { ForecastStep, type ForecastDayBusEntry } from '../steps/forecast.step';
import { createStepBus, type AiPipelineStepContext } from '../steps/step.types';
import {
    FORECAST_MODEL_EDGE,
    FORECAST_MODEL_SECOND_EDGE,
    FORECAST_MODEL_STAGE,
    forecastModelPayload,
} from './fixtures/forecast-model.fixture';
import { stepContext } from './fixtures/manager-snapshot.fixture';

/**
 * Ночной шаг прогноза (план Фазы 2, поток 16a; метод presentations-v2).
 * Проверяется главное: запись за каждый день по каждому менеджеру,
 * идентификатор использованной модели в нагрузке, честный
 * `pipelineExpected: null` с причиной, когда истории стадий нет, и то, что
 * открытые сделки в середину прогноза не входят.
 */
const DOMAIN = 'a.bitrix24.ru';
const MONTH = '2026-09';
const DAY = '2026-09-08';
const EDGE = FORECAST_MODEL_EDGE;
const SECOND_EDGE = FORECAST_MODEL_SECOND_EDGE;
const STAGE = FORECAST_MODEL_STAGE;

function context(
    overrides: Partial<AiPipelineStepContext> = {},
): AiPipelineStepContext {
    return stepContext({
        domain: DOMAIN,
        day: DAY,
        monthKey: MONTH,
        managerIds: [11],
        ...overrides,
    });
}

/** Модель портала: два ребра, стадийная θ и экспоненциальная шкала лага. */
const modelPayload = (): PortalModelPayload => forecastModelPayload(MONTH);

function month(monthKey: string, sales: number): PortalManagerMonth {
    return {
        monthKey,
        managerId: '11',
        tenureBand: '6-18',
        edges: [
            { edge: EDGE, n: 200, s: 40 },
            { edge: SECOND_EDGE, n: 40, s: 18 },
        ],
        excludeFromNorms: false,
        workedDays: 20,
        daysSource: 'calendar',
        callsDone: 200,
        presentations: 40,
        salesCount: sales,
        averageCheck: 100_000,
        planSales: 5,
        level: 'middle',
        score: { value: 7, n: 30 },
    };
}

function makeStep(options: {
    model?: PortalModelRecord | null;
    months?: PortalManagerMonth[];
}): {
    step: ForecastStep;
    upsert: jest.Mock;
    loadMonths: jest.Mock;
    loader: { latestModel: jest.Mock };
} {
    const upsert = jest
        .fn()
        .mockResolvedValue({ id: 'ais-7', supersededIds: [] });
    const loadMonths = jest
        .fn()
        .mockResolvedValue(
            options.months ?? [month('2026-08', 4), month(MONTH, 2)],
        );
    const loader = {
        loadMonths,
        latestModel: jest.fn().mockResolvedValue(options.model ?? null),
        loadModel: jest.fn().mockResolvedValue(null),
    };
    return {
        step: new ForecastStep(loader as never, { upsert } as never),
        upsert,
        loadMonths,
        loader,
    };
}

/** Конверт первой записи — то, что шаг положил в `ais`. */
function firstUpsert(upsert: jest.Mock): SnapshotEnvelope<ForecastPayload> {
    const calls = upsert.mock.calls as SnapshotEnvelope<ForecastPayload>[][];

    return calls[0][0];
}

/** Нагрузка первой записи. */
const payloadOf = (upsert: jest.Mock): ForecastPayload =>
    firstUpsert(upsert).payload;

describe('ForecastStep', () => {
    it('код и ритм шага: прогноз считается ночью', () => {
        const { step } = makeStep({});

        expect(step.code).toBe('forecast');
        expect(step.rhythms).toEqual(['nightly']);
    });

    it('пишет прогноз дня по менеджеру и несёт идентификатор модели', async () => {
        const { step, upsert, loader } = makeStep({
            model: {
                id: 'ais-model-3',
                monthKey: MONTH,
                payload: modelPayload(),
            },
        });
        const bus = createStepBus();

        const result = await step.run(context(), bus);

        expect(result.status).toBe('ok');
        expect(result.written).toBe(1);
        expect(firstUpsert(upsert)).toMatchObject({
            type: 'ai-analytics-forecast',
            periodKey: DAY,
            managerId: '11',
        });
        const payload = payloadOf(upsert);
        expect(payload.meta.modelSnapshotId).toBe('ais-model-3');
        expect(payload.day).toBe(DAY);
        // Модель — последнего закрытого месяца, а не последняя записанная.
        expect(loader.latestModel).toHaveBeenCalledWith(DOMAIN, MONTH);
        expect(payload.doneSales).toBe(2);
        expect(payload.naiveLastMonth).toBe(4);
        expect(payload.p50).toBeGreaterThanOrEqual(payload.descriptive);
        expect(payload.plan.items.length).toBeGreaterThan(0);
        expect(Array.isArray(payload.leaks)).toBe(true);
    });

    it('публикует прогнозы дня в шину forecastDay в форме писателя', async () => {
        const { step, upsert } = makeStep({
            model: {
                id: 'ais-model-3',
                monthKey: MONTH,
                payload: modelPayload(),
            },
        });
        const bus = createStepBus();

        await step.run(context(), bus);

        const entry = bus.get<ForecastDayBusEntry>(
            AI_PIPELINE_BUS_KEYS.forecastDay,
        );
        expect(entry).toBeDefined();
        expect(entry?.day).toBe(DAY);
        expect(entry?.monthKey).toBe(MONTH);
        expect(entry?.modelSnapshotId).toBe('ais-model-3');
        expect(entry?.managers.map(item => item.managerId)).toEqual(['11']);
        expect(entry?.managers[0].payload).toBe(payloadOf(upsert));
    });

    it('модели нет — шина forecastDay не заполняется', async () => {
        const { step } = makeStep({ model: null });
        const bus = createStepBus();

        await step.run(context(), bus);

        expect(bus.get(AI_PIPELINE_BUS_KEYS.forecastDay)).toBeUndefined();
    });

    it('без истории стадий ожидание от сделок — null с причиной, середина от презентаций', async () => {
        const { step, upsert } = makeStep({
            model: {
                id: 'ais-model-3',
                monthKey: MONTH,
                payload: modelPayload(),
            },
        });
        const bus = createStepBus();
        bus.set(AI_PIPELINE_BUS_KEYS.historyMonths, 0);

        await step.run(context(), bus);

        const payload = payloadOf(upsert);
        expect(payload.pipelineExpected).toBeNull();
        expect(payload.pipelineReason).toBe('no-stage-history');
        expect(payload.method).toBe('presentations-v2');
        // «Уже в работе» — от проведённых презентаций (или своих продаж).
        expect(payload.descriptive).toBeCloseTo(
            payload.doneSales + (payload.flow?.backlogExpected ?? 0),
            12,
        );
        expect(payload.p50).toBeCloseTo(
            payload.descriptive + payload.newFlowExpected,
            12,
        );
    });

    it('грузит историю подбора: W + K месяцев до месяца прогона и сам месяц', async () => {
        const { step, loadMonths } = makeStep({
            model: {
                id: 'ais-model-3',
                monthKey: MONTH,
                payload: modelPayload(),
            },
        });

        await step.run(context(), createStepBus());

        const keys = (loadMonths.mock.calls as [string, string[]][])[0][1];
        expect(keys).toHaveLength(19);
        expect(keys[0]).toBe('2025-03');
        expect(keys[keys.length - 1]).toBe(MONTH);
    });

    it('с историей стадий и сцепкой ожидание от сделок считается справочно, вне середины', async () => {
        const { step, upsert } = makeStep({
            model: {
                id: 'ais-model-3',
                monthKey: MONTH,
                payload: modelPayload(),
            },
        });
        const bus = createStepBus();
        bus.set(AI_PIPELINE_BUS_KEYS.historyMonths, 8);
        bus.set(AI_PIPELINE_BUS_KEYS.callsRows, [
            { transcriptionId: '900', managerId: '11' },
        ]);
        bus.set(AI_PIPELINE_BUS_KEYS.chain, {
            sharePct: 85,
            links: [{ callId: '900', episodeKey: 'D-1#0' }],
        });
        bus.set(AI_PIPELINE_BUS_KEYS.episodes, [
            {
                entityId: 'D-1',
                key: 'D-1#0',
                stageCode: STAGE,
                endedAt: null,
                ageDays: 10,
            },
        ]);

        await step.run(context(), bus);
        const plain = makeStep({
            model: {
                id: 'ais-model-3',
                monthKey: MONTH,
                payload: modelPayload(),
            },
        });
        await plain.step.run(context(), createStepBus());

        const payload = payloadOf(upsert);
        expect(payload.pipelineReason).toBeNull();
        expect(payload.pipelineExpected).toBeGreaterThan(0);
        // Сделки в середину не входят: без них прогноз тот же.
        expect(payload.p50).toBe(payloadOf(plain.upsert).p50);
        expect(payload.breakdown?.openEpisodes).toBe(1);
    });

    it('модели портала нет — шаг пропускается с причиной, записей нет', async () => {
        const { step, upsert } = makeStep({ model: null });

        const result = await step.run(context(), createStepBus());

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_PORTAL_MODEL_REASONS.modelMissing);
        expect(upsert).not.toHaveBeenCalled();
    });

    it('месячных снапшотов нет — шаг пропускается с причиной', async () => {
        const { step, upsert } = makeStep({
            model: {
                id: 'ais-model-3',
                monthKey: MONTH,
                payload: modelPayload(),
            },
            months: [],
        });

        const result = await step.run(context(), createStepBus());

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_PORTAL_MODEL_REASONS.monthMissing);
        expect(upsert).not.toHaveBeenCalled();
    });

    it('пустой ростер — шаг пропускается, модель не читается', async () => {
        const { step, upsert } = makeStep({});

        const result = await step.run(
            context({ managerIds: [] }),
            createStepBus(),
        );

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_PORTAL_MODEL_REASONS.rosterEmpty);
        expect(upsert).not.toHaveBeenCalled();
    });

    it('рабочие дни месяца: прошедшие и оставшиеся считаются по календарю', () => {
        const days = workdaysOf(context());

        expect(days.total).toBe(days.elapsed + days.left);
        expect(days.left).toBeGreaterThan(0);
    });
});
