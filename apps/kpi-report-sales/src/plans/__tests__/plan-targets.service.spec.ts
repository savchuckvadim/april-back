import { BitrixService } from '@/modules/bitrix';
import { PlanTargetsService } from '../domain/plan-targets.service';
import {
    PLAN_INDICATOR_CODES,
    PLAN_INDICATORS,
    planIndicatorUfName,
} from '../constants/plan-indicators.const';

const CALLS_UF = planIndicatorUfName(PLAN_INDICATOR_CODES.calls_done);
const SALES_UF = planIndicatorUfName(PLAN_INDICATOR_CODES.sales_count);

function makeBitrix(users: Record<string, unknown>[]) {
    const get = jest.fn().mockResolvedValue({ result: users });
    const batchUpdate = jest.fn();
    const callBatch = jest.fn().mockResolvedValue([]);
    const bitrix = {
        user: { get },
        batch: { user: { update: batchUpdate } },
        api: { callBatchWithConcurrency: callBatch },
    } as unknown as BitrixService;
    return { bitrix, get, batchUpdate, callBatch };
}

describe('PlanTargetsService', () => {
    it('getTargets: UF-значения → числа, пусто/мусор → null, все показатели каталога', async () => {
        const { bitrix, get } = makeBitrix([
            { ID: '123', [CALLS_UF]: '500', [SALES_UF]: '' },
        ]);
        const targets = await new PlanTargetsService(bitrix).getTargets([
            123, 456,
        ]);

        // select содержит ID и все плановые UF-поля
        const select = get.mock.calls[0][1] as string[];
        expect(select).toContain(CALLS_UF);
        expect(select).toHaveLength(1 + PLAN_INDICATORS.length);

        expect(targets).toHaveLength(2);
        const user123 = targets[0];
        expect(user123.userId).toBe(123);
        expect(user123.values).toHaveLength(PLAN_INDICATORS.length);
        expect(
            user123.values.find(
                value => value.code === PLAN_INDICATOR_CODES.calls_done,
            )?.value,
        ).toBe(500);
        expect(
            user123.values.find(
                value => value.code === PLAN_INDICATOR_CODES.sales_count,
            )?.value,
        ).toBeNull();
        // сотрудник без данных в Bitrix — все null
        expect(targets[1].values.every(value => value.value === null)).toBe(
            true,
        );
    });

    it('saveTargets: группировка по сотруднику, null → пустая строка (очистка)', async () => {
        const { bitrix, batchUpdate, callBatch } = makeBitrix([]);
        const updated = await new PlanTargetsService(bitrix).saveTargets([
            {
                userId: 123,
                code: PLAN_INDICATOR_CODES.calls_done,
                value: 500,
            },
            {
                userId: 123,
                code: PLAN_INDICATOR_CODES.sales_count,
                value: null,
            },
            {
                userId: 456,
                code: PLAN_INDICATOR_CODES.calls_done,
                value: 300,
            },
        ]);

        expect(updated).toBe(2);
        expect(batchUpdate).toHaveBeenCalledTimes(2); // один update на сотрудника
        expect(batchUpdate).toHaveBeenCalledWith('plan_targets_123', 123, {
            [CALLS_UF]: 500,
            [SALES_UF]: '',
        });
        expect(batchUpdate).toHaveBeenCalledWith('plan_targets_456', 456, {
            [CALLS_UF]: 300,
        });
        expect(callBatch).toHaveBeenCalled();
    });

    it('пустой вход — без запросов', async () => {
        const { bitrix, get, callBatch } = makeBitrix([]);
        const service = new PlanTargetsService(bitrix);
        expect(await service.getTargets([])).toEqual([]);
        expect(await service.saveTargets([])).toBe(0);
        expect(get).not.toHaveBeenCalled();
        expect(callBatch).not.toHaveBeenCalled();
    });
});
