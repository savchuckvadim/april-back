import {
    buildPlanTargets,
    planHeadsByFactKey,
    type PlanTargetsInput,
} from '../domain/assembler/plan-targets.assembler';
import {
    PLAN_FACT_SOURCES,
    PLAN_INDICATOR_CODES,
    PLAN_PERIOD_TYPES,
    type PlanIndicatorCode,
    type PlanIndicatorSetting,
    type PlanPeriodType,
} from '../../plans';

const [MONTH, QUARTER] = PLAN_PERIOD_TYPES;
const [KPI, FINANCE, AIRTIME] = PLAN_FACT_SOURCES;

const setting = (
    code: PlanIndicatorCode,
    periodType: PlanPeriodType = MONTH,
    overrides: Partial<PlanIndicatorSetting> = {},
): PlanIndicatorSetting => ({
    code,
    enabled: true,
    customName: null,
    periodType,
    ...overrides,
});

function input(overrides: Partial<PlanTargetsInput> = {}): PlanTargetsInput {
    return {
        config: [],
        targets: {},
        counters: {},
        finance: undefined,
        from: '2026-04-27',
        to: '2026-07-26',
        ...overrides,
    };
}

describe('buildPlanTargets — как блок «Планы» вкладки KPI', () => {
    it('кейс Агеевой: 45 / 265, 82 / 132,5, 0 / 8,83 за ~8,83 месяца при целях 30 / 15 / 1', () => {
        const cells = buildPlanTargets(
            input({
                config: [
                    setting(PLAN_INDICATOR_CODES.presentations_done),
                    setting(PLAN_INDICATOR_CODES.offers_sent),
                    setting(PLAN_INDICATOR_CODES.sales_count),
                ],
                targets: {
                    [PLAN_INDICATOR_CODES.presentations_done]: 30,
                    [PLAN_INDICATOR_CODES.offers_sent]: 15,
                    [PLAN_INDICATOR_CODES.sales_count]: 1,
                },
                counters: {
                    presentation_done: 45,
                    ev_offer_act_send: 82,
                    presentation_uniq_done: 40,
                },
                from: '2026-01-01',
                to: '2026-09-25',
            }),
        );

        expect(cells.map(cell => [cell.code, cell.fact, cell.plan])).toEqual([
            [PLAN_INDICATOR_CODES.presentations_done, 45, 265],
            [PLAN_INDICATOR_CODES.offers_sent, 82, 132.5],
            [PLAN_INDICATOR_CODES.sales_count, 0, 8.83],
        ]);
        expect(cells[0].percent).toBeCloseTo(45 / 265, 10);
        expect(cells[2].percent).toBe(0);
    });

    it('только включённые показатели, порядок и имя — из конфига портала', () => {
        const cells = buildPlanTargets(
            input({
                config: [
                    setting(PLAN_INDICATOR_CODES.calls_done, MONTH, {
                        enabled: false,
                    }),
                    setting(PLAN_INDICATOR_CODES.sales_count, MONTH, {
                        customName: 'План продаж',
                    }),
                    setting(PLAN_INDICATOR_CODES.presentations_done),
                ],
            }),
        );

        expect(cells.map(cell => [cell.code, cell.name])).toEqual([
            [PLAN_INDICATOR_CODES.sales_count, 'План продаж'],
            [PLAN_INDICATOR_CODES.presentations_done, 'Презентации'],
        ]);
    });

    it('план пересчитан на период по periodType; не задан или ≤ 0 — плана нет', () => {
        const cells = buildPlanTargets(
            input({
                config: [
                    setting(PLAN_INDICATOR_CODES.calls_done),
                    setting(PLAN_INDICATOR_CODES.presentations_done, QUARTER),
                    setting(PLAN_INDICATOR_CODES.offers_sent),
                    setting(PLAN_INDICATOR_CODES.invoices_sent),
                ],
                targets: {
                    [PLAN_INDICATOR_CODES.calls_done]: 30,
                    [PLAN_INDICATOR_CODES.presentations_done]: 90,
                    [PLAN_INDICATOR_CODES.offers_sent]: 0,
                    [PLAN_INDICATOR_CODES.invoices_sent]: null,
                },
                from: '2026-07-01',
                to: '2026-07-31',
            }),
        );

        expect(
            cells.map(cell => [cell.target, cell.plan, cell.percent]),
        ).toEqual([
            [30, 30, 0],
            [90, 30, 0],
            [0, null, null],
            [null, null, null],
        ]);
        expect(cells[1].periodType).toBe(QUARTER);
    });

    it('факт kpi — строка отчёта с кодом factKey; нет строки или счётчиков — 0', () => {
        const config = [setting(PLAN_INDICATOR_CODES.calls_done)];
        const targets = { [PLAN_INDICATOR_CODES.calls_done]: 30 };

        const [withCounters] = buildPlanTargets(
            input({ config, targets, counters: { call_done: 12 } }),
        );
        const [missing] = buildPlanTargets(input({ config, targets }));
        const [noKpi] = buildPlanTargets(
            input({ config, targets, counters: undefined }),
        );

        expect(withCounters.factSource).toBe(KPI);
        expect(withCounters.fact).toBe(12);
        expect(missing.fact).toBe(0);
        expect(noKpi.fact).toBe(0);
    });

    it('факт finance — итоги закрытых продаж сотрудника, как вкладка «Финансы»; нет сделок — 0', () => {
        const config = [
            setting(PLAN_INDICATOR_CODES.sales_monthly_amount),
            setting(PLAN_INDICATOR_CODES.advance_amount),
        ];
        const finance = {
            salesCount: 2,
            advanceAmount: 69024,
            paidMonths: 24,
            monthlyAmount: 9127,
            expectedContractAmount: 109524,
        };

        const withSales = buildPlanTargets(input({ config, finance }));
        const withoutSales = buildPlanTargets(input({ config }));

        expect(withSales.map(cell => [cell.factSource, cell.fact])).toEqual([
            [FINANCE, 9127],
            [FINANCE, 69024],
        ]);
        expect(withoutSales.map(cell => cell.fact)).toEqual([0, 0]);
    });

    it('эфирное время и звонки по длительности вкладка AI не загружает — факт null', () => {
        const cells = buildPlanTargets(
            input({
                config: [
                    setting(PLAN_INDICATOR_CODES.airtime_minutes),
                    setting(PLAN_INDICATOR_CODES.calls_over_30s),
                ],
                targets: {
                    [PLAN_INDICATOR_CODES.airtime_minutes]: 600,
                    [PLAN_INDICATOR_CODES.calls_over_30s]: 100,
                },
                from: '2026-07-01',
                to: '2026-07-31',
            }),
        );

        expect(cells[0].factSource).toBe(AIRTIME);
        expect(cells.map(cell => [cell.plan, cell.fact, cell.percent])).toEqual(
            [
                [600, null, null],
                [100, null, null],
            ],
        );
    });

    it('конфиг не прочитан — планов руководителя нет', () => {
        expect(buildPlanTargets(input({ config: undefined }))).toEqual([]);
    });
});

describe('planHeadsByFactKey — план руководителя для ячеек типов', () => {
    it('kpi-показатели с планом по innerCode факта; финансы и пустые планы не попадают', () => {
        const cells = buildPlanTargets(
            input({
                config: [
                    setting(PLAN_INDICATOR_CODES.calls_done),
                    setting(PLAN_INDICATOR_CODES.presentations_done),
                    setting(PLAN_INDICATOR_CODES.sales_count),
                    setting(PLAN_INDICATOR_CODES.sales_monthly_amount),
                ],
                targets: {
                    [PLAN_INDICATOR_CODES.calls_done]: 300,
                    [PLAN_INDICATOR_CODES.presentations_done]: 30,
                    [PLAN_INDICATOR_CODES.sales_monthly_amount]: 50000,
                },
                from: '2026-07-01',
                to: '2026-07-31',
            }),
        );

        expect(planHeadsByFactKey(cells)).toEqual(
            new Map([
                ['call_done', 300],
                ['presentation_done', 30],
            ]),
        );
    });
});
