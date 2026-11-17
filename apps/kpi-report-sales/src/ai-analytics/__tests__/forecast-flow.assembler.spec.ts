import { forecastMethodOf } from '@lib/sales-ai-analytics';
import {
    buildForecastLogDay,
    dayFlowOf,
    managerPointOf,
} from '../domain/assembler/department-forecast.assembler';
import {
    departmentFlowMonths,
    flowForecastOf,
    managerFlowInput,
    portalFlowOf,
} from '../domain/assembler/forecast-flow.assembler';
import type { ForecastBuildInput } from '../domain/assembler/forecast.types';
import type { PortalManagerMonth } from '../domain/assembler/portal-model.types';
import {
    managerFlowFixture,
    portalFlowFixture,
} from './fixtures/forecast-flow.fixture';
import {
    GSR_HISTORY,
    GSR_MONTH,
    gsrMonths,
} from './fixtures/forecast-gsr.fixture';
import { forecastPayload, managerMonth } from './fixtures/forecast-log.fixture';

/**
 * Сборка прогноза от презентаций (метод presentations-v2): ряд отдела из
 * снимков, подбор портала без заглядывания в месяц прогноза, вход
 * менеджера (презентации либо свои продажи) и метод дня журнала —
 * старые записи без поля читаются как расчёт по звонкам.
 */
const month = (
    managerId: string,
    monthKey: string,
    values: { presentations: number; sales: number; all?: number },
): PortalManagerMonth => ({
    ...managerMonth(managerId, monthKey, values.sales),
    presentations: values.presentations,
    presentationsAll: values.all ?? values.presentations,
});

describe('departmentFlowMonths — ряд отдела из снимков', () => {
    it('суммы по менеджерам; месяца нет в снимках — неизвестен; повтор записи — последняя', () => {
        const rows = departmentFlowMonths(
            [
                month('1', '2026-08', { presentations: 20, sales: 1 }),
                month('2', '2026-08', { presentations: 10, sales: 2, all: 30 }),
                month('2', '2026-08', { presentations: 12, sales: 2, all: 30 }),
            ],
            ['2026-07', '2026-08'],
        );

        expect(rows[0]).toMatchObject({ monthKey: '2026-07', known: false });
        expect(rows[1]).toEqual({
            monthKey: '2026-08',
            known: true,
            presentationsUniq: 32,
            presentations: 50,
            sales: 3,
        });
    });
});

describe('portalFlowOf — подбор портала на месяц', () => {
    it('18 месяцев до месяца прогноза; сам месяц в подбор не входит', () => {
        const months = gsrMonths().map(item =>
            item.monthKey === GSR_MONTH
                ? { ...item, presentations: 5000, salesCount: 0 }
                : item,
        );
        const flow = portalFlowOf(months, GSR_MONTH, {});

        expect(flow.keys).toEqual(GSR_HISTORY);
        expect(flow.fit.q).toBeCloseTo(0.03, 10);
        expect(flow.qKappa).toBe(300);
    });

    it('реестр портала переопределяет порог отметки презентаций', () => {
        const flow = portalFlowOf(gsrMonths(), GSR_MONTH, {
            portal: { forecast_flow_min_presentations: 1000 },
        });

        expect(flow.fit.status).toBe('not-applicable');
        expect(flow.fit.reason).toBe('presentations-not-marked');
    });
});

describe('managerFlowInput — вход менеджера', () => {
    const months = gsrMonths();
    const portal = portalFlowOf(months, GSR_MONTH, {});

    it('отмечает презентации: доля портала, прошлые месяцы, темп по месяцу', () => {
        const input = managerFlowInput({
            managerId: '1',
            months,
            monthKey: GSR_MONTH,
            portal,
            daysElapsed: 10,
        });

        expect(input.source).toBe('presentations');
        expect(input.presentationsDone).toBe(10);
        expect(input.presentationsRate).toBe(1);
        expect(input.pastPresentations).toEqual([20, 20, 20, 20, 20, 20]);
        expect(input.salesPerPresentation).toBeCloseTo(0.03, 10);
        expect(input.salesMean).toBeCloseTo(0.6, 12);
    });

    it('первый рабочий день — темп прошлого месяца на отработанные дни', () => {
        const input = managerFlowInput({
            managerId: '1',
            months,
            monthKey: GSR_MONTH,
            portal,
            daysElapsed: 0,
        });

        expect(input.presentationsRate).toBe(1);
    });

    it('продажи есть, презентаций нет — считается по своим продажам', () => {
        const silent = [
            ...months,
            ...GSR_HISTORY.map(key =>
                month('99', key, { presentations: 0, sales: 2, all: 0 }),
            ),
        ];
        const input = managerFlowInput({
            managerId: '99',
            months: silent,
            monthKey: GSR_MONTH,
            portal: portalFlowOf(silent, GSR_MONTH, {}),
            daysElapsed: 10,
        });

        expect(input.source).toBe('sales-history');
        expect(input.salesMean).toBe(2);
    });

    it('портал презентации не отмечает — все по своим продажам', () => {
        const blind = portalFlowOf(months, GSR_MONTH, {
            portal: { forecast_flow_min_presentations: 1000 },
        });
        const input = managerFlowInput({
            managerId: '1',
            months,
            monthKey: GSR_MONTH,
            portal: blind,
            daysElapsed: 10,
        });

        expect(input.source).toBe('sales-history');
    });
});

describe('flowForecastOf — слагаемые середины', () => {
    const base = {
        workdaysInMonth: 20,
        daysLeft: 10,
        flow: portalFlowFixture(),
    } as const;
    const inputOf = (
        flow: ReturnType<typeof managerFlowFixture>,
    ): ForecastBuildInput =>
        ({
            ...base,
            manager: { flow },
        }) as unknown as ForecastBuildInput;

    it('от презентаций: 0,2244 от проведённых и 0,0756 от новых — полмесяца из 0,6', () => {
        const result = flowForecastOf(inputOf(managerFlowFixture()));

        expect(result.backlog).toBeCloseTo(0.2244, 4);
        expect(result.fresh).toBeCloseTo(0.0756, 4);
        expect(result.backlog + result.fresh).toBeCloseTo(0.3, 12);
        expect(result.facts).toMatchObject({
            source: 'presentations',
            remainingShare: 0.5,
            portalQ: 0.03,
            rho: 0.5,
        });
    });

    it('по своим продажам: средние продажи на долю остатка, новых нет', () => {
        const result = flowForecastOf(
            inputOf(managerFlowFixture({ source: 'sales-history' })),
        );

        expect(result.backlog).toBeCloseTo(0.3, 12);
        expect(result.fresh).toBe(0);
    });
});

describe('метод дня журнала — совместимость со старыми записями', () => {
    const dayOf = (payloads: Parameters<typeof dayFlowOf>[0]) =>
        buildForecastLogDay({
            day: '2026-09-08',
            managers: payloads.map(payload => managerPointOf('11', payload)),
            phi: 2.5,
            phiSource: 'default',
            level: 0.8,
            check: { m: 11, v: 0.25 },
            seed: 1,
            mean3: null,
            modelSnapshotId: null,
            flow: dayFlowOf(payloads),
        });

    it('прогнозы без поля flow — день без метода, читается как расчёт по звонкам', () => {
        const day = dayOf([forecastPayload()]);

        expect(day.method).toBeUndefined();
        expect(day.flow).toBeUndefined();
        expect(forecastMethodOf(day.method)).toBe('calls-v1');
        expect(dayFlowOf([])).toEqual({});
    });

    it('прогноз от презентаций: метод, вход, подбор и число «по продажам»', () => {
        const flow = flowForecastOf({
            workdaysInMonth: 20,
            daysLeft: 10,
            flow: portalFlowFixture(),
            manager: {
                flow: managerFlowFixture({ source: 'sales-history' }),
            },
        } as unknown as ForecastBuildInput).facts;
        const day = dayOf([
            forecastPayload({
                method: 'presentations-v2',
                entry: 'presentation',
                flow,
                pipelineExpected: null,
            }),
        ]);

        expect(day.method).toBe('presentations-v2');
        expect(day.entry).toBe('presentation');
        expect(day.flow).toMatchObject({
            status: 'default-lag',
            q: 0.03,
            salesHistoryManagers: 1,
        });
        // Сделки в середину не входят — «неизвестных» менеджеров нет.
        expect(day.pipelineUnknown).toBe(0);
    });
});
