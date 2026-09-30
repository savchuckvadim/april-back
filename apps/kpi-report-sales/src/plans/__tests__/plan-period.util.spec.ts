import { PLAN_PERIOD_TYPE } from '../constants/plan-indicators.const';
import type { PlanPeriodType } from '../constants/plan-indicators.const';
import { planForRange, planMonthlyRate } from '../domain/plan-period.util';

/**
 * Кейсы сняты прогоном фронтовой `feature/plans/lib/plan-period.util.ts`
 * (date-fns, TZ Europe/Moscow): бэкенд обязан давать ровно те же числа,
 * что блок «Планы», — иначе AI-вкладка и виджет разойдутся.
 */
const FRONT_CASES: ReadonlyArray<
    readonly [number, PlanPeriodType, string, string, number]
> = [
    [30, PLAN_PERIOD_TYPE.month, '2026-07-01', '2026-07-31', 30],
    [30, PLAN_PERIOD_TYPE.month, '2026-07-15', '2026-07-31', 16.45],
    [90, PLAN_PERIOD_TYPE.quarter, '2026-07-01', '2026-07-31', 30],
    [90, PLAN_PERIOD_TYPE.quarter, '2026-07-01', '2026-09-30', 90],
    [120, PLAN_PERIOD_TYPE.year, '2026-01-01', '2026-12-31', 120],
    [120, PLAN_PERIOD_TYPE.year, '2026-02-01', '2026-02-28', 10],
    // Сценарий Агеевой: ~8,83 месяца при месячных целях 30 / 15 / 1.
    [30, PLAN_PERIOD_TYPE.month, '2026-01-01', '2026-09-25', 265],
    [15, PLAN_PERIOD_TYPE.month, '2026-01-01', '2026-09-25', 132.5],
    [1, PLAN_PERIOD_TYPE.month, '2026-01-01', '2026-09-25', 8.83],
    // Окно AI 27.04–26.07: неполные крайние месяцы.
    [30, PLAN_PERIOD_TYPE.month, '2026-04-27', '2026-07-26', 89.16],
    [199, PLAN_PERIOD_TYPE.month, '2026-04-27', '2026-07-26', 591.44],
    [30, PLAN_PERIOD_TYPE.month, '2028-02-01', '2028-02-29', 30],
    [30, PLAN_PERIOD_TYPE.month, '2028-02-10', '2028-02-20', 11.38],
    [30, PLAN_PERIOD_TYPE.month, '2026-07-31', '2026-07-31', 0.97],
    [30, PLAN_PERIOD_TYPE.month, '2026-12-15', '2027-01-15', 30.97],
    [10, PLAN_PERIOD_TYPE.quarter, '2026-08-10', '2026-09-06', 3.03],
    [7, PLAN_PERIOD_TYPE.year, '2026-03-03', '2026-11-17', 4.96],
];

describe('plan-period.util — пересчёт плана как во фронтовом блоке «Планы»', () => {
    it('месячная ставка: месяц /1, квартал /3, год /12', () => {
        expect(planMonthlyRate(30, PLAN_PERIOD_TYPE.month)).toBe(30);
        expect(planMonthlyRate(90, PLAN_PERIOD_TYPE.quarter)).toBe(30);
        expect(planMonthlyRate(120, PLAN_PERIOD_TYPE.year)).toBe(10);
    });

    it.each(FRONT_CASES)(
        'план %p (%s) на %s…%s = %p, как на фронте',
        (value, periodType, from, to, expected) => {
            expect(planForRange(value, periodType, from, to)).toBe(expected);
        },
    );

    it('from позже to → 0, как на фронте', () => {
        expect(
            planForRange(
                30,
                PLAN_PERIOD_TYPE.month,
                '2026-08-01',
                '2026-07-31',
            ),
        ).toBe(0);
    });

    it('невалидные даты → 0 (мусор, 13-й месяц, 31 февраля)', () => {
        expect(
            planForRange(30, PLAN_PERIOD_TYPE.month, 'garbage', '2026-07-31'),
        ).toBe(0);
        expect(
            planForRange(
                30,
                PLAN_PERIOD_TYPE.month,
                '2026-13-01',
                '2026-13-31',
            ),
        ).toBe(0);
        expect(
            planForRange(
                30,
                PLAN_PERIOD_TYPE.month,
                '2026-02-31',
                '2026-03-31',
            ),
        ).toBe(0);
    });

    it('дата со временем читается по календарному дню', () => {
        expect(
            planForRange(
                30,
                PLAN_PERIOD_TYPE.month,
                '2026-07-15T00:00:00',
                '2026-07-31T23:59:59',
            ),
        ).toBe(16.45);
    });
});
