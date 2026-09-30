import 'reflect-metadata';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    registryDefault,
    seedOf,
    backtestForecast,
    type ForecastBacktestSnapshot,
    type ForecastLogSnapshot,
    type SnapshotEnvelope,
} from '@lib/sales-ai-analytics';
import {
    AI_FORECAST_BACKTEST_RHYTHMS,
    AI_FORECAST_BACKTEST_STEP_CODE,
    AI_FORECAST_LOG_REASONS,
} from '../constants/ai-forecast-log.const';
import { monthKeysBack } from '../constants/ai-manager-snapshot.const';
import {
    backtestMonthsOf,
    backtestParamsOf,
} from '../steps/forecast-backtest.facts';
import { ForecastBacktestStep } from '../steps/forecast-backtest.step';
import type { AiPipelineStepContext } from '../steps/step.types';
import {
    forecastLog,
    logDay,
    managerMonth,
    snapshotRecord,
} from './fixtures/forecast-log.fixture';
import { stepContext } from './fixtures/manager-snapshot.fixture';

/**
 * Месячный шаг бэктеста прогноза отдела (Фаза 4, поток B2b): факт в
 * журнал закрытого месяца, rolling-origin по журналам с фактом, снапшот
 * точности с причинами.
 */
const MONTH = '2026-08';

const monthly = (
    overrides: Partial<AiPipelineStepContext> = {},
): AiPipelineStepContext =>
    stepContext({
        rhythm: 'monthly',
        day: '2026-09-03',
        monthKey: MONTH,
        managerIds: [11, 12],
        now: new Date('2026-09-03T01:00:00Z'),
        ...overrides,
    });

/** Журналы шести закрытых месяцев с фактом и текущий без факта. */
function history(): ForecastLogSnapshot[] {
    const months = [
        '2026-02',
        '2026-03',
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
    ];
    return [
        ...months.map((monthKey, index) =>
            forecastLog(
                monthKey,
                [
                    logDay(`${monthKey}-05`, 9 + index),
                    logDay(`${monthKey}-20`, 10),
                ],
                10 + (index % 2),
            ),
        ),
        forecastLog(MONTH, [logDay('2026-08-05', 9), logDay('2026-08-20', 10)]),
    ];
}

function makeStep(
    logs: ForecastLogSnapshot[] = history(),
    months = [managerMonth('11', MONTH, 4), managerMonth('12', MONTH, 6)],
) {
    const findByKeys = jest
        .fn()
        .mockResolvedValue(
            logs.map(log =>
                snapshotRecord(
                    AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
                    log.monthKey,
                    null,
                    log,
                ),
            ),
        );
    const upsert = jest
        .fn()
        .mockResolvedValue({ id: 'ais-1', supersededIds: [], written: 1 });
    const loader = { loadMonths: jest.fn().mockResolvedValue(months) };
    const step = new ForecastBacktestStep(
        loader as never,
        { findByKeys, upsert } as never,
    );
    return { step, findByKeys, upsert, loader };
}

const envelopeOf = <T>(upsert: jest.Mock, index: number): SnapshotEnvelope<T> =>
    (upsert.mock.calls as SnapshotEnvelope<T>[][])[index][0];

describe('ForecastBacktestStep — точность прогноза отдела', () => {
    it('код и ритмы: месячный и догон истории', () => {
        const { step } = makeStep();
        expect(step.code).toBe(AI_FORECAST_BACKTEST_STEP_CODE);
        expect(step.rhythms).toEqual(AI_FORECAST_BACKTEST_RHYTHMS);
        expect(step.rhythms).toEqual(['monthly', 'backfill']);
    });

    it('ростер пуст — пропуск, хранилище не читается', async () => {
        const { step, findByKeys } = makeStep();
        const result = await step.run(monthly({ managerIds: [] }));
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_FORECAST_LOG_REASONS.rosterEmpty);
        expect(findByKeys).not.toHaveBeenCalled();
    });

    it('читает журналы 12 месяцев по ключам, только отдел', async () => {
        const { step, findByKeys } = makeStep();
        await step.run(monthly());
        expect(findByKeys).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
            {
                periodKeys: monthKeysBack(MONTH, 12),
                managerIds: [null],
                latestOnly: true,
            },
        );
    });

    it('журнала закрытого месяца нет — пропуск, записей нет', async () => {
        const { step, upsert } = makeStep(history().slice(0, 6));
        const result = await step.run(monthly());
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_FORECAST_LOG_REASONS.logMissing);
        expect(upsert).not.toHaveBeenCalled();
    });

    it('месячных снапшотов ростера нет — факта нет, пропуск', async () => {
        const { step, upsert } = makeStep(history(), [
            managerMonth('99', MONTH, 40),
        ]);
        const result = await step.run(monthly());
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_FORECAST_LOG_REASONS.actualMissing);
        expect(upsert).not.toHaveBeenCalled();
    });

    it('ставит факт в журнал и пишет бэктест за закрытый месяц', async () => {
        const { step, upsert } = makeStep();
        const result = await step.run(monthly());
        expect(result.status).toBe('ok');
        expect(result.written).toBe(2);
        expect(result.rows).toBe(7);

        const log = envelopeOf<ForecastLogSnapshot>(upsert, 0);
        expect(log).toMatchObject({
            type: AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
            periodKey: MONTH,
            managerId: null,
        });
        expect(log.payload.actual).toBe(10);
        expect(log.payload.days).toHaveLength(2);
        expect(log.payload.meta.modelSnapshotId).toBe('ais-model-3');

        const backtest = envelopeOf<ForecastBacktestSnapshot>(upsert, 1);
        expect(backtest).toMatchObject({
            type: AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest,
            periodKey: MONTH,
            managerId: null,
        });
        expect(backtest.payload.shadowMonths).toBe(7);
        expect(backtest.payload.shadowMinMonths).toBe(
            registryDefault('forecast_shadow_min_months'),
        );
        expect(backtest.payload.backtest?.months).toHaveLength(7);
        expect(backtest.payload.status).toBe(backtest.payload.backtest?.status);
        expect((upsert.mock.calls as unknown[][])[1][1]).toEqual({
            force: false,
        });
    });

    it('seed бэктеста — seedOf(domain, месяц, calcVersion): результат совпадает с библиотекой', async () => {
        const { step, upsert } = makeStep();
        await step.run(monthly());
        const payload = envelopeOf<ForecastBacktestSnapshot>(upsert, 1).payload;
        const logs = new Map(
            history().map(log => [
                log.monthKey,
                log.monthKey === MONTH ? { ...log, actual: 10 } : log,
            ]),
        );
        const params = backtestParamsOf({});
        const expected = backtestForecast({
            months: backtestMonthsOf(logs),
            seed: seedOf('a.bitrix24.ru', MONTH, 'sam-1.0.0'),
            minMonths: params.minMonths,
            coverageTarget: params.coverageTarget,
            maseMax: params.maseMax,
            level: params.level,
        });
        expect(payload.backtest).toEqual(expected);
    });

    it('идемпотентен: повтор даёт те же нагрузки', async () => {
        const first = makeStep();
        const second = makeStep();
        await first.step.run(monthly());
        await second.step.run(monthly());
        expect(second.upsert.mock.calls).toEqual(first.upsert.mock.calls);
    });
});
