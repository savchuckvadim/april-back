import 'reflect-metadata';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    expectedCheck,
    registryDefault,
    type ForecastLogSnapshot,
    type SnapshotEnvelope,
} from '@lib/sales-ai-analytics';
import {
    AI_DEPARTMENT_FORECAST_RHYTHMS,
    AI_DEPARTMENT_FORECAST_STEP_CODE,
    AI_FORECAST_LOG_REASONS,
} from '../constants/ai-forecast-log.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import { DepartmentForecastStep } from '../steps/department-forecast.step';
import type { ForecastDayBusEntry } from '../steps/forecast.step';
import {
    createStepBus,
    type AiPipelineStepContext,
    type StepBus,
} from '../steps/step.types';
import {
    forecastLog,
    forecastPayload,
    logDay,
    managerMonth,
    snapshotRecord,
} from './fixtures/forecast-log.fixture';
import { stepContext } from './fixtures/manager-snapshot.fixture';

/**
 * Ночной шаг прогноза отдела (Фаза 4, поток B2b): сумма прогнозов
 * менеджеров → вилка и деньги отдела → день теневого журнала месяца.
 */
const DAY = '2026-09-08';
const MONTH = '2026-09';

const context = (
    overrides: Partial<AiPipelineStepContext> = {},
): AiPipelineStepContext =>
    stepContext({
        day: DAY,
        monthKey: MONTH,
        managerIds: [11, 12],
        ...overrides,
    });

function busWith(entry?: ForecastDayBusEntry): StepBus {
    const bus = createStepBus();
    if (entry !== undefined) bus.set(AI_PIPELINE_BUS_KEYS.forecastDay, entry);
    return bus;
}

const dayEntry = (): ForecastDayBusEntry => ({
    day: DAY,
    monthKey: MONTH,
    modelSnapshotId: 'ais-model-3',
    managers: [
        { managerId: '11', payload: forecastPayload() },
        {
            managerId: '12',
            payload: forecastPayload({
                p50: 4,
                doneSales: 1,
                naive: 3,
                descriptive: 1,
                pipelineExpected: null,
            }),
        },
        // Чужой менеджер (не в ростере) в сумму не входит.
        { managerId: '99', payload: forecastPayload({ p50: 100 }) },
    ],
});

interface StepOptions {
    readonly previousLog?: ForecastLogSnapshot | null;
    readonly forecasts?: ReturnType<typeof snapshotRecord>[];
    readonly model?: Record<string, unknown> | null;
    readonly months?: ReturnType<typeof managerMonth>[];
}

function makeStep(options: StepOptions = {}) {
    const findByKeys = jest.fn((_domain: string, type: string) => {
        if (type === AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog) {
            return Promise.resolve(
                options.previousLog
                    ? [
                          snapshotRecord(
                              AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
                              MONTH,
                              null,
                              options.previousLog,
                          ),
                      ]
                    : [],
            );
        }
        return Promise.resolve(options.forecasts ?? []);
    });
    const upsert = jest
        .fn()
        .mockResolvedValue({ id: 'ais-log', supersededIds: [], written: 1 });
    const loader = {
        loadMonths: jest
            .fn()
            .mockResolvedValue(
                options.months ?? [
                    managerMonth('11', '2026-06', 3),
                    managerMonth('12', '2026-06', 3),
                    managerMonth('11', '2026-07', 4),
                    managerMonth('12', '2026-07', 5),
                    managerMonth('11', '2026-08', 2),
                    managerMonth('12', '2026-08', 7),
                ],
            ),
        latestModel: jest.fn().mockResolvedValue(
            options.model === null
                ? null
                : {
                      id: 'ais-model-3',
                      monthKey: '2026-08',
                      payload: options.model ?? {
                          overdispersion: { value: 3, source: 'estimated' },
                      },
                  },
        ),
    };
    const step = new DepartmentForecastStep(
        loader as never,
        { findByKeys, upsert } as never,
    );
    return { step, findByKeys, upsert, loader };
}

const written = (upsert: jest.Mock): SnapshotEnvelope<ForecastLogSnapshot> =>
    (upsert.mock.calls as SnapshotEnvelope<ForecastLogSnapshot>[][])[0][0];

describe('DepartmentForecastStep — прогноз отдела', () => {
    it('код и ритм: каждую ночь', () => {
        const { step } = makeStep();
        expect(step.code).toBe(AI_DEPARTMENT_FORECAST_STEP_CODE);
        expect(step.rhythms).toEqual(AI_DEPARTMENT_FORECAST_RHYTHMS);
        expect(step.rhythms).toEqual(['nightly']);
    });

    it('ростер пуст — пропуск, хранилище не читается', async () => {
        const { step, findByKeys, upsert } = makeStep();
        const result = await step.run(context({ managerIds: [] }), busWith());
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_FORECAST_LOG_REASONS.rosterEmpty);
        expect(findByKeys).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();
    });

    it('прогнозов дня нет ни в шине, ни в хранилище — пропуск с причиной', async () => {
        const { step, upsert } = makeStep();
        const result = await step.run(context(), busWith());
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_FORECAST_LOG_REASONS.forecastDayMissing);
        expect(upsert).not.toHaveBeenCalled();
    });

    it('пишет журнал месяца отдела: ключ месяца, без менеджера, суммы по ростеру', async () => {
        const { step, upsert } = makeStep();
        const result = await step.run(context(), busWith(dayEntry()));

        expect(result.status).toBe('ok');
        expect(result.written).toBe(1);
        expect(result.rows).toBe(2);
        const envelope = written(upsert);
        expect(envelope).toMatchObject({
            type: AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
            periodKey: MONTH,
            managerId: null,
            paramsVersion: 'pv-1',
            inputsHash: 'hash-1',
        });
        expect((upsert.mock.calls as unknown[][])[0][1]).toEqual({
            force: false,
        });
        const log = envelope.payload;
        expect(log.actual).toBeNull();
        expect(log.checkSource).toBe('default');
        expect(log.days).toHaveLength(1);
        const [day] = log.days;
        expect(day.day).toBe(DAY);
        expect(day.p50).toBe(10);
        expect(day.done).toBe(3);
        expect(day.naive).toBe(8);
        expect(day.managers).toBe(2);
        expect(day.pipelineUnknown).toBe(1);
        expect(day.phi).toBe(3);
        expect(day.phiSource).toBe('estimated');
        expect(day.level).toBe(registryDefault('forecast_interval_level'));
        expect(day.low).toBeLessThanOrEqual(day.p50);
        expect(day.high).toBeGreaterThanOrEqual(day.p50);
        expect(day.low).toBeGreaterThanOrEqual(day.done);
        // Среднее отдела за июнь–август: (6 + 9 + 9) / 3.
        expect(day.mean3).toBe(8);
        expect(day.modelSnapshotId).toBe('ais-model-3');
        expect(day.money?.p50).toBeCloseTo(
            10 *
                expectedCheck(
                    registryDefault('check_lognormal_m'),
                    registryDefault('check_lognormal_v'),
                ),
            6,
        );
    });

    it('чек модели портала переводит продажи в деньги', async () => {
        const { step, upsert } = makeStep({
            model: {
                overdispersion: { value: 2, source: 'default' },
                checkLognormal: {
                    m: 11,
                    v: 0.5,
                    n: 40,
                    w: 0.7,
                    source: 'shrunk',
                },
            },
        });
        await step.run(context(), busWith(dayEntry()));
        const log = written(upsert).payload;
        expect(log.checkSource).toBe('shrunk');
        expect(log.days[0].phiSource).toBe('default');
        expect(log.days[0].money?.p50).toBeCloseTo(
            10 * expectedCheck(11, 0.5),
            6,
        );
    });

    it('модель без шины — последнего закрытого месяца (ключ раньше месяца прогона)', async () => {
        const { step, loader } = makeStep();
        const ctx = context();
        await step.run(ctx, busWith(dayEntry()));
        expect(loader.latestModel).toHaveBeenCalledWith(
            ctx.domain,
            ctx.monthKey,
        );
    });

    it('модели нет — φ и чек по умолчанию реестра, шаг не пропускается', async () => {
        const { step, upsert } = makeStep({ model: null });
        const result = await step.run(context(), busWith(dayEntry()));
        expect(result.status).toBe('ok');
        const day = written(upsert).payload.days[0];
        expect(day.phi).toBe(registryDefault('overdispersion_default'));
        expect(day.phiSource).toBe('default');
    });

    it('день журнала заменяется, остальные дни и факт сохраняются', async () => {
        const previous = forecastLog(
            MONTH,
            [logDay(DAY, 99), logDay('2026-09-07', 7)],
            42,
        );
        const { step, upsert } = makeStep({ previousLog: previous });
        await step.run(context(), busWith(dayEntry()));
        const log = written(upsert).payload;
        expect(log.days.map(day => day.day)).toEqual(['2026-09-07', DAY]);
        expect(log.days[1].p50).toBe(10);
        expect(log.days[0].p50).toBe(7);
        expect(log.actual).toBe(42);
    });

    it('идемпотентен: тот же прогон даёт ту же нагрузку', async () => {
        const first = makeStep();
        const second = makeStep();
        await first.step.run(context(), busWith(dayEntry()));
        await second.step.run(context(), busWith(dayEntry()));
        expect(written(second.upsert).payload).toEqual(
            written(first.upsert).payload,
        );
    });

    it('без шины читает прогнозы дня из хранилища', async () => {
        const { step, upsert, findByKeys } = makeStep({
            forecasts: [
                snapshotRecord(
                    AI_ANALYTICS_SNAPSHOT_TYPE.forecast,
                    DAY,
                    '11',
                    forecastPayload(),
                ),
            ],
        });
        const result = await step.run(context(), busWith());
        expect(result.status).toBe('ok');
        expect(findByKeys).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            AI_ANALYTICS_SNAPSHOT_TYPE.forecast,
            { periodKeys: [DAY], managerIds: ['11', '12'], latestOnly: true },
        );
        expect(written(upsert).payload.days[0].p50).toBe(6);
    });

    it('принудительный пересчёт передаётся в хранилище', async () => {
        const { step, upsert } = makeStep();
        await step.run(context({ forceRefresh: true }), busWith(dayEntry()));
        expect((upsert.mock.calls as unknown[][])[0][1]).toEqual({
            force: true,
        });
    });
});
