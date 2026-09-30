import 'reflect-metadata';
import { leverKeyOf } from '@lib/sales-ai-analytics';
import {
    AI_RECOMMENDATION_LOG_RHYTHMS,
    AI_RECOMMENDATION_LOG_STEP_CODE,
    AI_RECOMMENDATION_REASONS,
} from '../constants/ai-recommendation-effect.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import { leverObject } from '../store/ai-analytics-recommendation-log.store';
import type { ForecastDayBusEntry } from '../steps/forecast.step';
import { RecommendationLogStep } from '../steps/recommendation-log.step';
import { createStepBus, type StepBus } from '../steps/step.types';
import { forecastPayload, lever } from './fixtures/forecast-log.fixture';
import { stepContext } from './fixtures/manager-snapshot.fixture';

/**
 * Ночной журнал выдачи советов (Фаза 4, поток B2b): каждый совет из
 * прогнозов дня отмечается один раз на (менеджер, ключ, месяц).
 */
const DAY = '2026-09-08';
const MONTH = '2026-09';
const volume = lever();
const quality = lever({
    lever: 'quality',
    ruleCode: 'quality-gap',
    callType: undefined,
    section: 'needs',
    deltaSales: null,
    ci80: null,
});

const context = (managerIds: number[] = [11, 12]) =>
    stepContext({ day: DAY, monthKey: MONTH, managerIds });

function busWith(entry?: ForecastDayBusEntry): StepBus {
    const bus = createStepBus();
    if (entry !== undefined) bus.set(AI_PIPELINE_BUS_KEYS.forecastDay, entry);
    return bus;
}

const entry = (): ForecastDayBusEntry => ({
    day: DAY,
    monthKey: MONTH,
    modelSnapshotId: 'ais-model-3',
    managers: [
        {
            managerId: '11',
            payload: forecastPayload({ levers: [volume, quality] }),
        },
        { managerId: '12', payload: forecastPayload({ levers: [volume] }) },
    ],
});

function makeStep(alreadyIssued: string[] = []) {
    const log = {
        issuedObjects: jest.fn().mockResolvedValue(new Set(alreadyIssued)),
        markIssued: jest.fn().mockResolvedValue('ais-fb-1'),
    };
    const snapshots = { findByKeys: jest.fn().mockResolvedValue([]) };
    const step = new RecommendationLogStep(log as never, snapshots as never);
    return { step, log, snapshots };
}

describe('RecommendationLogStep — журнал выдачи советов', () => {
    it('код и ритм: каждую ночь', () => {
        const { step } = makeStep();
        expect(step.code).toBe(AI_RECOMMENDATION_LOG_STEP_CODE);
        expect(step.rhythms).toEqual(AI_RECOMMENDATION_LOG_RHYTHMS);
        expect(step.rhythms).toEqual(['nightly']);
    });

    it('ростер пуст — пропуск, журнал не читается', async () => {
        const { step, log } = makeStep();
        const result = await step.run(context([]), busWith(entry()));
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_RECOMMENDATION_REASONS.rosterEmpty);
        expect(log.issuedObjects).not.toHaveBeenCalled();
    });

    it('прогнозов дня нет — пропуск с причиной, записей нет', async () => {
        const { step, log } = makeStep();
        const result = await step.run(context(), busWith());
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(
            AI_RECOMMENDATION_REASONS.forecastDayMissing,
        );
        expect(log.markIssued).not.toHaveBeenCalled();
    });

    it('отмечает каждый совет по ключу leverKeyOf с нагрузкой выдачи', async () => {
        const { step, log } = makeStep();
        const result = await step.run(context(), busWith(entry()));
        expect(result.status).toBe('ok');
        expect(result.rows).toBe(3);
        expect(result.written).toBe(3);
        expect(log.issuedObjects).toHaveBeenCalledWith('a.bitrix24.ru', MONTH);
        expect(log.markIssued).toHaveBeenCalledWith(
            {
                domain: 'a.bitrix24.ru',
                managerId: '11',
                key: leverKeyOf(volume),
                monthKey: MONTH,
            },
            {
                day: DAY,
                lever: 'volume',
                ruleCode: 'volume-gap',
                deltaSales: 1.5,
                ci80: [0.5, 2.5],
                evidence: 'E0',
                calcVersion: 'sam-1.0.0',
            },
        );
        const keys = (
            log.markIssued.mock.calls as [{ managerId: string; key: string }][]
        ).map(([key]) => `${key.managerId}|${key.key}`);
        expect(keys).toEqual([
            `11|${leverKeyOf(volume)}`,
            `11|${leverKeyOf(quality)}`,
            `12|${leverKeyOf(volume)}`,
        ]);
    });

    it('уже выданный в месяце совет не пишется повторно (дедуп)', async () => {
        const { step, log } = makeStep([
            leverObject('11', leverKeyOf(volume)),
            leverObject('12', leverKeyOf(volume)),
        ]);
        const result = await step.run(context(), busWith(entry()));
        expect(result.written).toBe(1);
        expect(log.markIssued).toHaveBeenCalledTimes(1);
    });

    it('один и тот же совет дважды за прогон пишется один раз', async () => {
        const { step, log } = makeStep();
        const twice: ForecastDayBusEntry = {
            ...entry(),
            managers: [
                {
                    managerId: '11',
                    payload: forecastPayload({ levers: [volume, volume] }),
                },
            ],
        };
        await step.run(context([11]), busWith(twice));
        expect(log.markIssued).toHaveBeenCalledTimes(1);
    });

    it('советов нет — шаг проходит без записей', async () => {
        const { step, log } = makeStep();
        const empty: ForecastDayBusEntry = {
            ...entry(),
            managers: [{ managerId: '11', payload: forecastPayload() }],
        };
        const result = await step.run(context([11]), busWith(empty));
        expect(result.status).toBe('ok');
        expect(result.written).toBe(0);
        expect(log.markIssued).not.toHaveBeenCalled();
    });

    it('совет с неразбираемым ключом (пустое правило) в журнал не идёт', async () => {
        const { step, log } = makeStep();
        const broken: ForecastDayBusEntry = {
            ...entry(),
            managers: [
                {
                    managerId: '11',
                    payload: forecastPayload({
                        levers: [lever({ ruleCode: '' }), volume],
                    }),
                },
            ],
        };
        const result = await step.run(context([11]), busWith(broken));
        expect(result.written).toBe(1);
        expect(log.markIssued).toHaveBeenCalledTimes(1);
        expect((log.markIssued.mock.calls[0] as [{ key: string }])[0].key).toBe(
            leverKeyOf(volume),
        );
    });

    it('менеджеры вне ростера не попадают в журнал', async () => {
        const { step, log } = makeStep();
        await step.run(context([12]), busWith(entry()));
        expect(log.markIssued).toHaveBeenCalledTimes(1);
        expect(
            (log.markIssued.mock.calls[0] as [{ managerId: string }])[0]
                .managerId,
        ).toBe('12');
    });
});
