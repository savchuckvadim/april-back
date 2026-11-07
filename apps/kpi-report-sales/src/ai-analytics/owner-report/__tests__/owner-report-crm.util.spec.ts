import { PLAN_INDICATOR_CODE_LIST, PLAN_INDICATOR_CODES } from '../../../plans';
import type { AiFinanceResult } from '../../domain/loaders/finance.types';
import type { AiKpiMonthsResult } from '../../domain/loaders/kpi.types';
import type { AiPlansResult } from '../../domain/loaders/plans.types';
import { buildOwnerReportCrmFacts } from '../owner-report-crm.util';

/** Закрытые продажи: только поля, которые читает сборка. */
const finance = (): AiFinanceResult =>
    ({
        managers: [
            {
                managerId: 7,
                salesCount: 2,
                monthlyAmount: 30_000,
                expectedContractAmount: 360_000,
            },
            {
                managerId: 8,
                salesCount: 1,
                monthlyAmount: 12_000,
                expectedContractAmount: 144_000,
            },
            // Чужой менеджер — вне периметра, в средний чек не входит.
            {
                managerId: 99,
                salesCount: 10,
                monthlyAmount: 1,
                expectedContractAmount: 1,
            },
        ],
    }) as unknown as AiFinanceResult;

const kpi = (): AiKpiMonthsResult =>
    ({
        months: [
            {
                managers: [
                    {
                        managerId: 7,
                        documents: { invoices: 3 },
                        presentationsUniq: { done: 4 },
                    },
                ],
            },
            {
                managers: [
                    {
                        managerId: 7,
                        documents: { invoices: 1 },
                        presentationsUniq: { done: 2 },
                    },
                    {
                        managerId: 8,
                        documents: { invoices: 2 },
                        presentationsUniq: { done: 1 },
                    },
                ],
            },
        ],
    }) as unknown as AiKpiMonthsResult;

const plans = (enabled: boolean): AiPlansResult =>
    ({
        config: PLAN_INDICATOR_CODE_LIST.map(code => ({
            code,
            enabled:
                enabled && code === PLAN_INDICATOR_CODES.sales_monthly_amount,
            customName: null,
            periodType: 'month',
        })),
        managers: [
            {
                managerId: 7,
                targets: {
                    [PLAN_INDICATOR_CODES.sales_monthly_amount]: 40_000,
                },
            },
        ],
    }) as unknown as AiPlansResult;

describe('buildOwnerReportCrmFacts — CRM-факты отчёта собственнику', () => {
    const period = { from: '2026-10-01', to: '2026-10-31' };

    it('сделки и деньги из финансов, счета и показы из KPI по месяцам, план на период', () => {
        const facts = buildOwnerReportCrmFacts({
            kpi: kpi(),
            finance: finance(),
            plans: plans(true),
            ...period,
            managerIds: ['7', '8'],
        });
        expect(facts?.byManager).toEqual({
            '7': {
                deals: 2,
                invoices: 4,
                presentations: 6,
                plan: 40_000,
                salesAmount: 30_000,
            },
            '8': {
                deals: 1,
                invoices: 2,
                presentations: 1,
                plan: null,
                salesAmount: 12_000,
            },
        });
        // (360 000 + 144 000) / 3 сделки отдела; чужой менеджер не считается.
        expect(facts?.avgCheck).toBe(168_000);
    });

    it('квартал: план месяца умножается на три месяца периода', () => {
        const facts = buildOwnerReportCrmFacts({
            kpi: null,
            finance: finance(),
            plans: plans(true),
            from: '2026-07-01',
            to: '2026-09-30',
            managerIds: ['7'],
        });
        expect(facts?.byManager['7'].plan).toBe(120_000);
        expect(facts?.byManager['7'].invoices).toBe(0);
    });

    it('показатель плана выключен — плана нет; без финансов деньги null', () => {
        const noPlan = buildOwnerReportCrmFacts({
            kpi: kpi(),
            finance: finance(),
            plans: plans(false),
            ...period,
            managerIds: ['7'],
        });
        expect(noPlan?.byManager['7'].plan).toBeNull();
        const noFinance = buildOwnerReportCrmFacts({
            kpi: kpi(),
            finance: null,
            plans: null,
            ...period,
            managerIds: ['7'],
        });
        expect(noFinance?.byManager['7']).toMatchObject({
            deals: 0,
            salesAmount: null,
            invoices: 4,
        });
        expect(noFinance?.avgCheck).toBeNull();
    });

    it('без KPI и финансов — CRM-фактов нет', () => {
        expect(
            buildOwnerReportCrmFacts({
                kpi: null,
                finance: null,
                plans: plans(true),
                ...period,
                managerIds: ['7'],
            }),
        ).toBeNull();
    });
});
