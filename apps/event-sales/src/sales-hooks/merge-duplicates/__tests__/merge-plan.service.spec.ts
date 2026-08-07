import { MergePlanService } from '../services/merge-plan.service';

const makeBitrix = (rows: Record<string, unknown>) => ({
    api: {
        addCmdBatch: jest.fn(),
        callBatchAsync: jest.fn().mockResolvedValue([{ result: rows }]),
    },
});

const portal = {
    getDealCategoryByCode: (code: string) =>
        code === 'sales_base' ? { bitrixId: '5' } : undefined,
};

describe('MergePlanService', () => {
    it('survivor — самая старая сущность (тай-брейк меньший ID), жертвы отдельно', async () => {
        const service = new MergePlanService(
            makeBitrix({
                mp_COMPANY_431: {
                    ID: '431',
                    TITLE: 'Старая',
                    DATE_CREATE: '2020-01-01T00:00:00+03:00',
                },
                mp_COMPANY_8821: {
                    ID: '8821',
                    TITLE: 'Новая',
                    DATE_CREATE: '2026-01-01T00:00:00+03:00',
                },
            }) as never,
            portal as never,
        );

        const plan = await service.build(['COMPANY_8821', 'COMPANY_431']);

        expect(plan.groups).toHaveLength(1);
        expect(plan.groups[0].survivorId).toBe(431);
        expect(plan.groups[0].victimIds).toEqual([8821]);
        expect(plan.planHash).toHaveLength(32);
    });

    it('сделка чужой воронки отбрасывается с причиной, наша — участвует', async () => {
        const service = new MergePlanService(
            makeBitrix({
                mp_DEAL_1: {
                    ID: '1',
                    CATEGORY_ID: '5',
                    DATE_CREATE: '2020-01-01',
                },
                mp_DEAL_2: {
                    ID: '2',
                    CATEGORY_ID: '99',
                    DATE_CREATE: '2021-01-01',
                },
            }) as never,
            portal as never,
        );

        const plan = await service.build(['DEAL_1', 'DEAL_2']);

        expect(plan.participants.map(p => p.id)).toEqual([1]);
        expect(plan.skipped.some(s => s.includes('DEAL_2'))).toBe(true);
        // Одна сделка — группы нет (сливать не с чем).
        expect(plan.groups).toHaveLength(0);
    });

    it('кросс-тип: сделка без компании перепривязывается к компании-survivor', async () => {
        const service = new MergePlanService(
            makeBitrix({
                mp_COMPANY_431: {
                    ID: '431',
                    DATE_CREATE: '2020-01-01',
                },
                mp_DEAL_1: {
                    ID: '1',
                    CATEGORY_ID: '5',
                    DATE_CREATE: '2021-01-01',
                },
            }) as never,
            portal as never,
        );

        const plan = await service.build(['COMPANY_431', 'DEAL_1']);

        expect(plan.groups).toHaveLength(0);
        expect(plan.relink).toEqual([{ dealId: 1, companyId: 431 }]);
    });

    it('planHash детерминирован и не зависит от порядка refs', async () => {
        const rows = {
            mp_COMPANY_431: { ID: '431', DATE_CREATE: '2020-01-01' },
            mp_COMPANY_8821: { ID: '8821', DATE_CREATE: '2026-01-01' },
        };
        const planA = await new MergePlanService(
            makeBitrix(rows) as never,
            portal as never,
        ).build(['COMPANY_431', 'COMPANY_8821']);
        const planB = await new MergePlanService(
            makeBitrix(rows) as never,
            portal as never,
        ).build(['COMPANY_8821', 'COMPANY_431']);
        expect(planA.planHash).toBe(planB.planHash);
    });
});
