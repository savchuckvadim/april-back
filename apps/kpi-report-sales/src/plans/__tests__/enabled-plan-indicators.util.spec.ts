import {
    PLAN_INDICATOR_CODES,
    PLAN_PERIOD_TYPE,
    PLAN_UNIT,
    type PlanIndicatorSetting,
} from '../constants/plan-indicators.const';
import { enabledPlanIndicators } from '../domain/enabled-plan-indicators.util';

const setting = (
    code: PlanIndicatorSetting['code'],
    overrides: Partial<PlanIndicatorSetting> = {},
): PlanIndicatorSetting => ({
    code,
    enabled: true,
    customName: null,
    periodType: PLAN_PERIOD_TYPE.month,
    ...overrides,
});

describe('enabledPlanIndicators — как enabledIndicators фронтового блока «Планы»', () => {
    it('только включённые, в порядке конфига, с метаданными каталога', () => {
        const result = enabledPlanIndicators([
            setting(PLAN_INDICATOR_CODES.calls_done, { enabled: false }),
            setting(PLAN_INDICATOR_CODES.presentations_done),
            setting(PLAN_INDICATOR_CODES.sales_monthly_amount, {
                periodType: PLAN_PERIOD_TYPE.quarter,
            }),
        ]);

        expect(result.map(item => item.code)).toEqual([
            PLAN_INDICATOR_CODES.presentations_done,
            PLAN_INDICATOR_CODES.sales_monthly_amount,
        ]);
        expect(result[0]).toMatchObject({
            factSource: 'kpi',
            factKey: 'presentation_done',
            unit: PLAN_UNIT.count,
            displayName: 'Презентации',
            periodType: PLAN_PERIOD_TYPE.month,
        });
        expect(result[1]).toMatchObject({
            factSource: 'finance',
            factKey: 'monthlyAmount',
            unit: PLAN_UNIT.money,
            periodType: PLAN_PERIOD_TYPE.quarter,
        });
    });

    it('своё название портала главнее, пустое — название по умолчанию', () => {
        const [custom, empty] = enabledPlanIndicators([
            setting(PLAN_INDICATOR_CODES.sales_count, {
                customName: 'План продаж',
            }),
            setting(PLAN_INDICATOR_CODES.offers_sent, { customName: '' }),
        ]);

        expect(custom.displayName).toBe('План продаж');
        expect(empty.displayName).toBe('КП');
    });

    it('код вне каталога отбрасывается', () => {
        const foreign = {
            ...setting(PLAN_INDICATOR_CODES.calls_done),
            code: 'no_such_indicator',
        } as unknown as PlanIndicatorSetting;

        expect(enabledPlanIndicators([foreign])).toEqual([]);
    });
});
