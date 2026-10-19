import 'reflect-metadata';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    DEFAULT_WORK_CALENDAR,
    type ForecastLogSnapshot,
    type SnapshotEnvelope,
} from '@lib/sales-ai-analytics';
import {
    AI_FORECAST_LOG_REASONS,
    AI_FORECAST_LOG_REPLAY_RHYTHMS,
    AI_FORECAST_LOG_REPLAY_STEP_CODE,
} from '../constants/ai-forecast-log.const';
import { AI_PORTAL_MODEL_REASONS } from '../constants/ai-portal-model.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import type { ClosedSaleDay } from '../domain/loaders/closed-sales-days.loader';
import { forecastLogOf } from '../steps/department-forecast.facts';
import { backtestMonthsOf } from '../steps/forecast-backtest.facts';
import { ForecastLogReplayStep } from '../steps/forecast-log-replay.step';
import {
    createStepBus,
    type AiPipelineStepContext,
    type StepBus,
} from '../steps/step.types';
import {
    forecastLog,
    logDay,
    managerMonth,
    snapshotRecord,
} from './fixtures/forecast-log.fixture';
import { stepContext } from './fixtures/manager-snapshot.fixture';
import { recomputeModel } from './fixtures/recompute.fixture';

/**
 * Шаг воспроизведения теневого журнала прогноза (задача «прогноз отдела
 * быстрее»): по закрытому месяцу — прогноз отдела на каждый рабочий день
 * по данным, известным к этому дню; живые дни ночного журнала не
 * затираются; идемпотентно; месяц без данных — пропуск с причиной.
 */
const MONTH = '2026-09';
const NOW = new Date('2026-10-05T01:00:00Z');
const MODEL_ID = 'ais-model-aug';

/** Рабочие дни сентября 2026 по календарю без праздников: 22 дня. */
const SEPTEMBER_WORKDAYS = 22;

const context = (
    overrides: Partial<AiPipelineStepContext> = {},
): AiPipelineStepContext =>
    stepContext({
        rhythm: 'backfill',
        day: '2026-09-30',
        monthKey: MONTH,
        managerIds: [10, 20],
        now: NOW,
        calendar: { ...DEFAULT_WORK_CALENDAR, holidays: [] },
        ...overrides,
    });

const CLOSE_DAYS: ClosedSaleDay[] = [
    { managerId: '10', closeDay: '2026-09-03' },
    { managerId: '10', closeDay: '2026-09-15' },
    { managerId: '20', closeDay: '2026-09-10' },
    // Чужой менеджер в ростер не входит.
    { managerId: '99', closeDay: '2026-09-01' },
];

const MONTHS = [
    managerMonth('10', MONTH, 5),
    managerMonth('20', MONTH, 3),
    { ...managerMonth('10', '2026-08', 4), callsDone: 210 },
    managerMonth('20', '2026-08', 6),
    managerMonth('10', '2026-07', 4),
    managerMonth('20', '2026-07', 5),
    managerMonth('10', '2026-06', 3),
    managerMonth('20', '2026-06', 3),
];

interface StepOptions {
    readonly previousLog?: ForecastLogSnapshot | null;
    readonly model?: PortalModelPayload | null;
    readonly months?: ReturnType<typeof managerMonth>[];
    readonly closeDays?: ClosedSaleDay[];
}

let modelPayload: PortalModelPayload | null = null;
const model = (): PortalModelPayload => (modelPayload ??= recomputeModel());

function makeStep(options: StepOptions = {}) {
    const findByKeys = jest.fn((_domain: string, type: string) =>
        Promise.resolve(
            type === AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog &&
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
        ),
    );
    const upsert = jest
        .fn()
        .mockResolvedValue({ id: 'ais-log', supersededIds: [], written: 1 });
    const loader = {
        loadMonths: jest.fn().mockResolvedValue(options.months ?? MONTHS),
        latestModel: jest.fn().mockResolvedValue(
            options.model === null
                ? null
                : {
                      id: MODEL_ID,
                      monthKey: '2026-08',
                      payload: options.model ?? model(),
                  },
        ),
    };
    const closedSales = {
        load: jest.fn().mockResolvedValue(options.closeDays ?? CLOSE_DAYS),
    };
    const step = new ForecastLogReplayStep(
        loader as never,
        { findByKeys, upsert } as never,
        closedSales as never,
    );

    return { step, findByKeys, upsert, loader, closedSales };
}

const written = (upsert: jest.Mock): SnapshotEnvelope<ForecastLogSnapshot> =>
    (upsert.mock.calls as SnapshotEnvelope<ForecastLogSnapshot>[][])[0][0];

/** Шина с историей стадий: один открытый эпизод менеджера 10. */
function busWithPipeline(): StepBus {
    const bus = createStepBus();
    const stageCode = model().stageTheta[0]?.stageCode ?? 'sales_pres';
    bus.set(AI_PIPELINE_BUS_KEYS.historyMonths, 6);
    bus.set(AI_PIPELINE_BUS_KEYS.episodes, [
        {
            key: 'D1#0',
            stageCode,
            startedAt: '2026-08-20T10:00:00.000Z',
            endedAt: null,
        },
        {
            key: 'D2#0',
            stageCode,
            startedAt: '2026-09-02T10:00:00.000Z',
            // Продана 10 сентября: после этого дня в пайплайне её нет.
            endedAt: '2026-09-10T10:00:00.000Z',
        },
    ]);
    bus.set(AI_PIPELINE_BUS_KEYS.chain, {
        links: [
            { episodeKey: 'D1#0', callId: 'c1' },
            { episodeKey: 'D2#0', callId: 'c2' },
        ],
    });
    bus.set(AI_PIPELINE_BUS_KEYS.callsRows, [
        { transcriptionId: 'c1', managerId: '10' },
        { transcriptionId: 'c2', managerId: '20' },
    ]);

    return bus;
}

describe('ForecastLogReplayStep — воспроизведение журнала прогноза', () => {
    it('код, ритмы бэктеста и необязательность', () => {
        const { step } = makeStep();
        expect(step.code).toBe(AI_FORECAST_LOG_REPLAY_STEP_CODE);
        expect(step.rhythms).toEqual(AI_FORECAST_LOG_REPLAY_RHYTHMS);
        expect(step.rhythms).toEqual(['monthly', 'backfill']);
        expect(step.optional).toBe(true);
    });

    it('ростер пуст — пропуск, хранилище не читается', async () => {
        const { step, loader, upsert } = makeStep();
        const result = await step.run(context({ managerIds: [] }));
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_FORECAST_LOG_REASONS.rosterEmpty);
        expect(loader.latestModel).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();
    });

    it('месяц прогона ещё не закрыт — пропуск, будущее не трогается', async () => {
        const { step, loader, upsert } = makeStep();
        const result = await step.run(
            context({ monthKey: '2026-10', day: '2026-10-31' }),
        );
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_FORECAST_LOG_REASONS.replayMonthOpen);
        expect(loader.latestModel).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();
    });

    it('модели портала с закрытым месяцем раньше M нет — пропуск с причиной', async () => {
        const { step, loader, upsert } = makeStep({ model: null });
        const result = await step.run(context());
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_PORTAL_MODEL_REASONS.modelMissing);
        expect(loader.latestModel).toHaveBeenCalledWith('a.bitrix24.ru', MONTH);
        expect(upsert).not.toHaveBeenCalled();
    });

    it('месячных снапшотов менеджеров за месяц нет — пропуск, сделки не читаются', async () => {
        const { step, closedSales, upsert } = makeStep({
            months: [managerMonth('10', '2026-08', 4)],
        });
        const result = await step.run(context());
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_PORTAL_MODEL_REASONS.monthMissing);
        expect(closedSales.load).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();
    });

    it('восстанавливает все рабочие дни закрытого месяца: продажи к дню, факт месяца, пометки', async () => {
        const { step, upsert, closedSales } = makeStep();
        const result = await step.run(context());

        expect(result.status).toBe('ok');
        expect(result.rows).toBe(SEPTEMBER_WORKDAYS);
        expect(result.written).toBe(1);
        expect(closedSales.load).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            '2026-09-01',
            '2026-09-30',
            [10, 20],
            { forceRefresh: false },
        );
        const envelope = written(upsert);
        expect(envelope).toMatchObject({
            type: AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
            periodKey: MONTH,
            managerId: null,
        });
        expect((upsert.mock.calls as unknown[][])[0][1]).toEqual({
            force: false,
        });
        const log = envelope.payload;
        expect(log.monthKey).toBe(MONTH);
        expect(log.days).toHaveLength(SEPTEMBER_WORKDAYS);
        expect(log.days.every(day => day.replayed === true)).toBe(true);
        expect(log.days.map(day => day.day)).toEqual(
            [...log.days.map(day => day.day)].sort(),
        );
        expect(log.meta.source).toBe('replay');
        expect(log.meta.modelSnapshotId).toBe(MODEL_ID);
        // Факт месяца — как у бэктеста: сумма продаж ростера (5 + 3).
        expect(log.actual).toBe(8);
        const byDay = new Map(log.days.map(day => [day.day, day]));
        // Сделано к дню — сделки, закрытые строго раньше дня, только ростер.
        expect(byDay.get('2026-09-01')?.done).toBe(0);
        expect(byDay.get('2026-09-04')?.done).toBe(1);
        expect(byDay.get('2026-09-11')?.done).toBe(2);
        expect(byDay.get('2026-09-16')?.done).toBe(3);
        expect(byDay.get('2026-09-30')?.done).toBe(3);
        // В первый рабочий день наивная база — факт прошлого месяца (4 + 6).
        expect(byDay.get('2026-09-01')?.naive).toBe(10);
        // Среднее трёх замороженных месяцев до 3-го числа — май–июль нет (null),
        // с 3-го — июнь–август: (6 + 9 + 10) / 3.
        expect(byDay.get('2026-09-01')?.mean3).toBeNull();
        expect(byDay.get('2026-09-03')?.mean3).toBeCloseTo(25 / 3, 9);
        expect(byDay.get('2026-09-01')?.managers).toBe(2);
        expect(byDay.get('2026-09-01')?.modelSnapshotId).toBe(MODEL_ID);
        for (const day of log.days) {
            expect(day.low).toBeLessThanOrEqual(day.p50);
            expect(day.high).toBeGreaterThanOrEqual(day.p50);
            expect(day.p50).toBeGreaterThanOrEqual(day.done);
        }
    });

    it('без истории стадий в шине ожидание от сделок — неизвестно у всех, а не ноль', async () => {
        const { step, upsert } = makeStep();
        await step.run(context(), createStepBus());
        const log = written(upsert).payload;
        expect(log.days.every(day => day.pipelineUnknown === 2)).toBe(true);
    });

    it('с историей стадий пайплайн на день d — эпизоды, открытые в ночь на d', async () => {
        const plain = makeStep();
        await plain.step.run(context(), createStepBus());
        const { step, upsert } = makeStep();
        await step.run(context(), busWithPipeline());
        const log = written(upsert).payload;
        const byDay = new Map(log.days.map(day => [day.day, day]));
        expect(log.days.every(day => day.pipelineUnknown === 0)).toBe(true);
        // Пайплайн добавляет ожидание: P50 не меньше, чем без него.
        const plainByDay = new Map(
            written(plain.upsert).payload.days.map(day => [day.day, day]),
        );
        expect(byDay.get('2026-09-08')?.p50).toBeGreaterThan(
            plainByDay.get('2026-09-08')?.p50 ?? Number.POSITIVE_INFINITY,
        );
        // Эпизод D2 закрыт 10 сентября: позже он в пайплайн не входит, и
        // прибавка к P50 падает (сравнение с днём без него).
        const gainBefore =
            (byDay.get('2026-09-09')?.p50 ?? 0) -
            (plainByDay.get('2026-09-09')?.p50 ?? 0);
        const gainAfter =
            (byDay.get('2026-09-14')?.p50 ?? 0) -
            (plainByDay.get('2026-09-14')?.p50 ?? 0);
        expect(gainAfter).toBeLessThan(gainBefore);
    });

    it('живые дни ночного журнала не затираются: восстанавливаются только дни раньше первого живого', async () => {
        const previous = forecastLog(
            MONTH,
            [
                logDay('2026-09-15', 99),
                logDay('2026-09-22', 98),
                // Прежний воспроизведённый день — переписывается.
                logDay('2026-09-01', 97, { replayed: true }),
            ],
            42,
        );
        const { step, upsert } = makeStep({ previousLog: previous });
        const result = await step.run(context());
        expect(result.status).toBe('ok');
        expect(result.rows).toBe(10);
        const log = written(upsert).payload;
        expect(log.days).toHaveLength(12);
        const live = log.days.filter(day => day.replayed !== true);
        expect(live.map(day => [day.day, day.p50])).toEqual([
            ['2026-09-15', 99],
            ['2026-09-22', 98],
        ]);
        const replayed = log.days.filter(day => day.replayed === true);
        expect(replayed.every(day => day.day < '2026-09-15')).toBe(true);
        expect(replayed.some(day => day.p50 === 97)).toBe(false);
        // Факт пересчитан по месяцам ростера, а не унаследован.
        expect(log.actual).toBe(8);
    });

    it('журнал месяца живой с первого рабочего дня — пропуск, сделки не читаются', async () => {
        const { step, upsert, closedSales } = makeStep({
            previousLog: forecastLog(MONTH, [logDay('2026-09-01', 9)], 8),
        });
        const result = await step.run(context());
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_FORECAST_LOG_REASONS.replayNothingToDo);
        expect(closedSales.load).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();
    });

    it('идемпотентен: повтор даёт ту же нагрузку, зёрна детерминированы', async () => {
        const first = makeStep();
        const second = makeStep();
        await first.step.run(context(), busWithPipeline());
        await second.step.run(context(), busWithPipeline());
        expect(written(second.upsert).payload).toEqual(
            written(first.upsert).payload,
        );
    });

    it('принудительный пересчёт: отчёт сделок без кэша и запись с force', async () => {
        const { step, upsert, closedSales } = makeStep();
        await step.run(context({ forceRefresh: true }));
        expect((closedSales.load.mock.calls as unknown[][])[0][4]).toEqual({
            forceRefresh: true,
        });
        expect((upsert.mock.calls as unknown[][])[0][1]).toEqual({
            force: true,
        });
    });

    it('восстановленный журнал читается forecastLogOf и попадает в бэктест с фактом', async () => {
        const { step, upsert } = makeStep();
        await step.run(context());
        const parsed = forecastLogOf(
            JSON.parse(JSON.stringify(written(upsert).payload)),
        );
        expect(parsed).not.toBeNull();
        expect(parsed?.days).toHaveLength(SEPTEMBER_WORKDAYS);
        expect(parsed?.days.every(day => day.replayed === true)).toBe(true);
        expect(parsed?.meta.source).toBe('replay');
        const months = backtestMonthsOf(
            new Map([[MONTH, parsed as ForecastLogSnapshot]]),
        );
        expect(months).toHaveLength(1);
        expect(months[0].actual).toBe(8);
        expect(months[0].days).toHaveLength(SEPTEMBER_WORKDAYS);
    });
});
