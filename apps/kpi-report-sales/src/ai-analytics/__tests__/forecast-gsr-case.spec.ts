import 'reflect-metadata';
import {
    DEFAULT_WORK_CALENDAR,
    forecastMethodOf,
    type ForecastLogDay,
} from '@lib/sales-ai-analytics';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import {
    buildForecastLogDay,
    dayFlowOf,
    managerPointOf,
} from '../domain/assembler/department-forecast.assembler';
import type { ForecastPayload } from '../domain/assembler/forecast.types';
import { forecastLogOf } from '../steps/department-forecast.facts';
import { workdaysOf } from '../steps/forecast.facts';
import { ForecastStep, type ForecastDayBusEntry } from '../steps/forecast.step';
import { createStepBus, type AiPipelineStepContext } from '../steps/step.types';
import { forecastLog } from './fixtures/forecast-log.fixture';
import {
    GSR_CALLS,
    GSR_DAY,
    GSR_HOLIDAYS,
    GSR_MANAGERS,
    GSR_MONTH,
    gsrMonths,
} from './fixtures/forecast-gsr.fixture';
import { forecastModelPayload } from './fixtures/forecast-model.fixture';
import { stepContext } from './fixtures/manager-snapshot.fixture';

/**
 * «Случай gsr» (задача 17.11.2026): ночной прогноз от презентаций на
 * 17.11 и день журнала отдела. Старый расчёт ждал 37,6 продажи: каждый из
 * 541 учтённого звонка умножался на долю «звонок → продажа» 9,7 % и
 * «успеет закрыться» 64 %. Новый — порядка простых расчётов: закрыто 4
 * плюс 7,2 продажи в месяц на оставшуюся половину месяца.
 */
const context = (): AiPipelineStepContext =>
    stepContext({
        domain: 'gsr.example.ru',
        day: GSR_DAY,
        monthKey: GSR_MONTH,
        weekKey: '2026-W47',
        managerIds: GSR_MANAGERS.map(Number),
        calendar: { ...DEFAULT_WORK_CALENDAR, holidays: [...GSR_HOLIDAYS] },
        now: new Date('2026-11-17T00:45:00Z'),
    });

/** Ночной шаг прогноза на случае gsr → прогнозы менеджеров дня. */
async function nightPayloads(callsFactor = 1): Promise<ForecastPayload[]> {
    const loader = {
        loadMonths: jest.fn().mockResolvedValue(gsrMonths(callsFactor)),
        latestModel: jest.fn().mockResolvedValue({
            id: 'ais-model-oct',
            monthKey: '2026-10',
            payload: forecastModelPayload('2026-10', GSR_MANAGERS),
        }),
    };
    const upsert = jest
        .fn()
        .mockResolvedValue({ id: 'ais-1', supersededIds: [] });
    const step = new ForecastStep(loader as never, { upsert } as never);
    const bus = createStepBus();
    await step.run(context(), bus);
    const entry = bus.get<ForecastDayBusEntry>(
        AI_PIPELINE_BUS_KEYS.forecastDay,
    );

    return (entry?.managers ?? []).map(item => item.payload);
}

/** День журнала отдела по прогнозам менеджеров. */
function departmentDay(payloads: readonly ForecastPayload[]): ForecastLogDay {
    return buildForecastLogDay({
        day: GSR_DAY,
        managers: payloads.map((payload, index) =>
            managerPointOf(GSR_MANAGERS[index], payload),
        ),
        phi: 2.5,
        phiSource: 'default',
        level: 0.8,
        check: { m: 11, v: 0.25 },
        seed: 17,
        mean3: 7.2,
        modelSnapshotId: 'ais-model-oct',
        flow: dayFlowOf(payloads),
    });
}

describe('случай gsr — прогноз отдела от презентаций', () => {
    it('календарь случая: 20 рабочих дней, к 17.11 прошло 10', () => {
        expect(workdaysOf(context())).toEqual({
            total: 20,
            elapsed: 10,
            left: 10,
        });
        expect(GSR_CALLS.reduce((sum, calls) => sum + calls, 0)).toBe(541);
    });

    it('середина ≈ 7,6 (закрыто 4 + 2,7 от проведённых + 0,9 от новых), а не 37,6', async () => {
        const payloads = await nightPayloads();
        const day = departmentDay(payloads);
        const descriptive = day.descriptive ?? 0;

        expect(payloads).toHaveLength(14);
        expect(day.done).toBe(4);
        expect(day.p50).toBeCloseTo(7.6, 6);
        expect(descriptive - day.done).toBeCloseTo(2.6929, 4);
        expect(day.p50 - descriptive).toBeCloseTo(0.9071, 4);
        // Порядок простых расчётов: по темпу 8,0, среднее за три — 7,2.
        expect(day.naive).toBeCloseTo(8, 9);
        expect(day.p50).toBeGreaterThan(6.5);
        expect(day.p50).toBeLessThan(9);
        expect(day.low).toBeLessThanOrEqual(day.p50);
        expect(day.high).toBeGreaterThanOrEqual(day.p50);
    });

    it('у каждого сотрудника «от новых презентаций» меньше половины продажи', async () => {
        const payloads = await nightPayloads();

        for (const payload of payloads) {
            expect(payload.method).toBe('presentations-v2');
            expect(payload.flow?.source).toBe('presentations');
            expect(payload.newFlowExpected).toBeLessThan(0.5);
            expect(payload.flow?.salesPerPresentation).toBeCloseTo(0.03, 10);
        }
        // Сотрудник с 141 звонком за 10 дней: старый расчёт ждал 8,8.
        expect(payloads[0].p50).toBeCloseTo(1.3, 6);
        expect(payloads[0].breakdown?.entryDone).toBe(10);
    });

    it('звонки на середину не влияют: × 10 звонков — тот же прогноз', async () => {
        const base = departmentDay(await nightPayloads());
        const tenfold = departmentDay(await nightPayloads(10));

        expect(tenfold.p50).toBeCloseTo(base.p50, 12);
        expect(tenfold.descriptive).toBeCloseTo(base.descriptive ?? 0, 12);
    });

    it('день журнала несёт метод, вход и подбор; после чтения из ais — тот же метод', async () => {
        const day = departmentDay(await nightPayloads());

        expect(day.method).toBe('presentations-v2');
        expect(day.entry).toBe('presentation-uniq');
        expect(day.flow).toMatchObject({
            status: 'default-lag',
            reason: 'lag-not-identified',
            rho: 0.5,
            salesHistoryManagers: 0,
        });
        expect(day.flow?.q).toBeCloseTo(0.03, 10);
        expect(day.pipelineUnknown).toBe(0);
        const read = forecastLogOf(forecastLog(GSR_MONTH, [day]));
        expect(forecastMethodOf(read?.days[0]?.method)).toBe(
            'presentations-v2',
        );
    });
});
