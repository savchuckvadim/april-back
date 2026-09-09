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
import { ForecastStep } from '../steps/forecast.step';
import { createStepBus, type AiPipelineStepContext } from '../steps/step.types';
import { stepContext } from './fixtures/manager-snapshot.fixture';

/**
 * Ночной шаг прогноза (план Фазы 2, поток 16a). Проверяется главное:
 * запись за каждый день по каждому менеджеру, идентификатор
 * использованной модели в нагрузке и честный `pipelineExpected: null` с
 * причиной, когда истории стадий нет.
 */
const DOMAIN = 'a.bitrix24.ru';
const MONTH = '2026-09';
const DAY = '2026-09-08';
const EDGE = 'call_to_presentation';
const SECOND_EDGE = 'presentation_to_offer';
const STAGE = 'sales_in_progress';

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
function modelPayload(): PortalModelPayload {
    return {
        monthKey: MONTH,
        window: [MONTH],
        observations: 1,
        managers: 1,
        edges: [
            {
                edge: EDGE,
                mu: 0.2,
                n: 500,
                kappa: 30,
                layer: 'portal',
                managers: 3,
                kappaSource: 'default',
                kappaKind: 'late',
                kappaGateOpen: false,
                rho: null,
                homogeneous: false,
            },
            {
                edge: SECOND_EDGE,
                mu: 0.5,
                n: 100,
                kappa: 30,
                layer: 'portal',
                managers: 3,
                kappaSource: 'default',
                kappaKind: 'late',
                kappaGateOpen: false,
                rho: null,
                homogeneous: false,
            },
        ],
        managerNorms: [
            {
                managerId: '11',
                tenureBand: '6-18',
                edges: [
                    {
                        edge: EDGE,
                        mu: 0.2,
                        layer: 'portal',
                        n: 400,
                        w: 1,
                        kappa: 30,
                    },
                    {
                        edge: SECOND_EDGE,
                        mu: 0.5,
                        layer: 'portal',
                        n: 80,
                        w: 1,
                        kappa: 30,
                    },
                ],
            },
        ],
        kappa: 30,
        overdispersion: { value: 2.5, source: 'default' },
        mS: 10,
        msSource: 'default',
        msGroups: 0,
        sRef: 7,
        sRefSource: 'default',
        cap: 25,
        capSource: 'default',
        capActivity: 'call',
        cycleMedianDays: 28,
        lagCdf: {
            kind: 'exponential',
            medianDays: 28,
            n: 0,
            points: [
                { days: 7, value: 0.16 },
                { days: 14, value: 0.29 },
                { days: 28, value: 0.5 },
                { days: 60, value: 0.77 },
            ],
        },
        stageTheta: [
            {
                stageCode: STAGE,
                order: 8,
                n: 40,
                s: 6,
                value: 0.15,
                w: 0.5,
                ci90: null,
            },
        ],
        chainSharePct: 85,
        edgeKind: 'prob',
        edgeKindReason: 'chain-entered',
        betaSource: 'none',
        betaCountdown: null,
        season: { index: 1, source: 'default', note: 'Сезонность не оценена' },
        readiness: {
            mode: 'descriptive',
            historyMonths: 6,
            presentations: 300,
            sales: 20,
            comparableFrom: '',
            reasons: [],
        },
        sanity: null,
        events: [],
        detectedEvents: [],
        reused: false,
        reusedReason: null,
        signature: {
            rubricVersion: null,
            scriptHash: null,
            priceMedian: null,
        },
        meta: {
            calcVersion: 'sam-1.0.0',
            paramsVersion: 'pv-1',
            comparableFrom: null,
            generatedAt: '2026-09-03T01:00:00.000Z',
            modelSnapshotId: null,
        },
    };
}

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
}): { step: ForecastStep; upsert: jest.Mock; loadMonths: jest.Mock } {
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
        const { step, upsert } = makeStep({
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
        expect(payload.doneSales).toBe(2);
        expect(payload.naiveLastMonth).toBe(4);
        expect(payload.p50).toBeGreaterThanOrEqual(payload.descriptive);
        expect(payload.plan.items.length).toBeGreaterThan(0);
        expect(Array.isArray(payload.leaks)).toBe(true);
    });

    it('без истории стадий ожидание от пайплайна — null с причиной', async () => {
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
        expect(payload.descriptive).toBe(payload.doneSales);
    });

    it('с историей стадий и сцепкой считает ожидание от открытых сделок', async () => {
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

        const payload = payloadOf(upsert);
        expect(payload.pipelineReason).toBeNull();
        expect(payload.pipelineExpected).toBeGreaterThan(0);
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
