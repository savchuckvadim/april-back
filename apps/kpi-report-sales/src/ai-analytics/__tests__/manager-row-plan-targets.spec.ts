import { emptyCallFacts } from '../domain/assembler/call-facts.assembler';
import { sumKpiMonths } from '../domain/assembler/manager-facts.assembler';
import type { AiFinanceManagerSummary } from '../domain/loaders/finance.types';
import { toManagerTargets } from '../domain/loaders/plans.loader';
import {
    buildManagerRow,
    type ManagerRowInput,
} from '../domain/presenter/manager-row.presenter';
import {
    PLAN_INDICATOR_CODES,
    PLAN_INDICATORS,
    PLAN_PERIOD_TYPES,
    type PlanIndicatorSetting,
} from '../../plans';
import {
    kpiManagerMonth,
    kpiMonth,
    kpiMonths,
    pipelineRow,
} from './fixtures/manager-snapshot.fixture';

const [MONTH] = PLAN_PERIOD_TYPES;
const FROM = '2026-04-27';
const TO = '2026-07-26';

/** Включены: звонки, презентации, продажи (шт) и месячная сумма. */
const ENABLED = new Set<string>([
    PLAN_INDICATOR_CODES.calls_done,
    PLAN_INDICATOR_CODES.presentations_done,
    PLAN_INDICATOR_CODES.sales_count,
    PLAN_INDICATOR_CODES.sales_monthly_amount,
]);
const CONFIG: PlanIndicatorSetting[] = PLAN_INDICATORS.map(indicator => ({
    code: indicator.code,
    enabled: ENABLED.has(indicator.code),
    customName: null,
    periodType: MONTH,
}));

/** KPI двух месяцев: самоотчёт CRM 199/8 звонков и 9/8 презентаций. */
function kpiFacts() {
    const month = (key: string, counters: Record<string, number>) =>
        kpiMonth(key, [
            {
                ...kpiManagerMonth(10, { callDone: counters.call_done }),
                calls: { plan: counters.call_plan, done: counters.call_done },
                presentations: {
                    plan: counters.presentation_plan,
                    done: counters.presentation_done,
                },
                counters,
            },
        ]);
    const result = kpiMonths([
        month('2026-05', {
            call_plan: 120,
            call_done: 5,
            presentation_plan: 6,
            presentation_done: 5,
            ev_success_done: 1,
        }),
        month('2026-06', {
            call_plan: 79,
            call_done: 3,
            presentation_plan: 3,
            presentation_done: 3,
        }),
    ]);
    return sumKpiMonths({ ...result, from: FROM, to: TO });
}

function finance(): AiFinanceManagerSummary {
    return {
        ...pipelineRow(10),
        salesCount: 2,
        advanceAmount: 69024,
        paidMonths: 24,
        monthlyAmount: 9127,
        expectedContractAmount: 109524,
        source: { from: FROM, to: TO, generatedAt: '2026-09-30T10:11:00.000Z' },
    };
}

function rowInput(overrides: Partial<ManagerRowInput> = {}): ManagerRowInput {
    return {
        managerId: '10',
        matrixRow: undefined,
        kpi: kpiFacts().get(10),
        plans: toManagerTargets(
            10,
            {
                userId: 10,
                values: [
                    { code: PLAN_INDICATOR_CODES.calls_done, value: 300 },
                    {
                        code: PLAN_INDICATOR_CODES.presentations_done,
                        value: 30,
                    },
                    { code: PLAN_INDICATOR_CODES.sales_count, value: 1 },
                    {
                        code: PLAN_INDICATOR_CODES.sales_monthly_amount,
                        value: 20000,
                    },
                ],
            },
            CONFIG,
        ),
        finance: finance(),
        org: undefined,
        level: undefined,
        callFacts: emptyCallFacts('10'),
        workdays: 64,
        periodTo: TO,
        teamMedians: new Map(),
        ...overrides,
    };
}

/** planHead KPI-кода в ячейке типа звонка. */
function planHeadOf(
    row: ReturnType<typeof buildManagerRow>,
    callType: string,
    code: string,
): number | undefined {
    return row.byType
        .find(cell => cell.callType === callType)
        ?.kpi.find(item => item.code === code)?.planHead;
}

describe('Строка менеджера: план руководителя как блок «Планы»', () => {
    it('sumKpiMonths суммирует счётчики kpi-report по месяцам и несёт период', () => {
        const kpi = kpiFacts().get(10);

        expect(kpi?.period).toEqual({ from: FROM, to: TO });
        expect(kpi?.counters).toEqual({
            call_plan: 199,
            call_done: 8,
            presentation_plan: 9,
            presentation_done: 8,
            ev_success_done: 1,
        });
    });

    it('planTargets: включённые показатели, план на период обзора, факт KPI и финансов', () => {
        const row = buildManagerRow(rowInput());

        expect(
            row.planTargets?.map(cell => [cell.code, cell.plan, cell.fact]),
        ).toEqual([
            [PLAN_INDICATOR_CODES.calls_done, 891.61, 8],
            [PLAN_INDICATOR_CODES.presentations_done, 89.16, 8],
            [PLAN_INDICATOR_CODES.sales_count, 2.97, 1],
            [PLAN_INDICATOR_CODES.sales_monthly_amount, 59440.86, 9127],
        ]);
    });

    it('колонки «Звонки CRM» / «Презентации CRM» — самоотчёт CRM, не план руководителя', () => {
        const row = buildManagerRow(rowInput());

        expect(row.discipline).toEqual({
            callPlan: 199,
            callDone: 8,
            presentationPlan: 9,
            presentationDone: 8,
        });
    });

    it('planHead ячеек — план на период по factKey каталога: презентации на presentation, не presentation_uniq', () => {
        const row = buildManagerRow(rowInput());

        expect(planHeadOf(row, 'presentation', 'presentation')).toBe(89.16);
        expect(
            planHeadOf(row, 'presentation', 'presentation_uniq'),
        ).toBeUndefined();
        expect(planHeadOf(row, 'call', 'call')).toBe(891.61);
        expect(planHeadOf(row, 'payment', 'ev_success')).toBe(2.97);
    });

    it('финансовый хвост несёт источник чисел: период и момент расчёта', () => {
        const row = buildManagerRow(rowInput());

        expect(row.finance.source).toEqual({
            from: FROM,
            to: TO,
            generatedAt: '2026-09-30T10:11:00.000Z',
        });
        expect(row.finance.salesCount).toBe(2);
    });

    it('конфиг планов не прочитан — planTargets пуст, planHead нет', () => {
        const row = buildManagerRow(
            rowInput({ plans: toManagerTargets(10, undefined) }),
        );

        expect(row.planTargets).toEqual([]);
        expect(planHeadOf(row, 'presentation', 'presentation')).toBeUndefined();
    });

    it('строка вне ростера (нет ни KPI, ни финансов) — планов нет', () => {
        const row = buildManagerRow(
            rowInput({ kpi: undefined, finance: undefined }),
        );

        expect(row.planTargets).toEqual([]);
    });
});
