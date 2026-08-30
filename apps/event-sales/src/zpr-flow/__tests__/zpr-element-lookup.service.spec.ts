import { ZprElementLookupService } from '../services/zpr-element-lookup.service';
import { BxRow } from '../types/zpr-flow-run.type';
import { job, makeBitrix, makeInfo } from './zpr-flow.fixtures';

/**
 * Какой открытый элемент считается «тем самым» для этого отчёта: матч по
 * базовой сделке, при её отсутствии — по компании, у лид-only клиента — по
 * лиду. Фильтр по стадиям серверный, матч по связи — в JS.
 */
describe('ZprElementLookupService', () => {
    const lookupOf = (openItems: BxRow[]) =>
        new ZprElementLookupService(makeBitrix({ openItems }).bitrix);

    it('открытый элемент клиента находится по базовой сделке', async () => {
        const lookup = lookupOf([
            { id: 601, stageId: 'DT1038_9:PLAN', ufCrm7BaseDeal: ['D_100'] },
        ]);

        const open = await lookup.findOpenElement(makeInfo(), job());

        expect(open?.id).toBe(601);
    });

    it('чужой открытый элемент (другая сделка) не подхватывается', async () => {
        const lookup = lookupOf([
            { id: 700, stageId: 'DT1038_9:PLAN', ufCrm7BaseDeal: ['D_999'] },
        ]);

        expect(await lookup.findOpenElement(makeInfo(), job())).toBeNull();
    });

    it('голый id в одиночно-типизированном поле связи тоже матчится', async () => {
        // Битрикс нормализовал одиночную привязку до числа.
        const lookup = lookupOf([
            { id: 700, stageId: 'DT1038_9:PLAN', ufCrm7BaseDeal: ['100'] },
        ]);

        const open = await lookup.findOpenElement(makeInfo(), job());

        expect(open?.id).toBe(700);
    });

    it('сделки нет — матч по компании', async () => {
        const lookup = lookupOf([
            { id: 610, stageId: 'DT1038_9:PLAN', ufCrm7Company: ['CO_431'] },
        ]);

        const open = await lookup.findOpenElement(
            makeInfo(),
            job({ baseDealId: null }),
        );

        expect(open?.id).toBe(610);
    });

    it('лид-only клиент: элемент находится по лиду', async () => {
        const lookup = lookupOf([
            { id: 620, stageId: 'DT1038_9:PLAN', ufCrm7Lead: ['L_42'] },
        ]);

        const open = await lookup.findOpenElement(
            makeInfo(),
            job({ baseDealId: null, companyId: null }),
        );

        expect(open?.id).toBe(620);
    });

    it('несколько открытых — берётся самый свежий (максимальный id)', async () => {
        const lookup = lookupOf([
            { id: 601, stageId: 'DT1038_9:PLAN', ufCrm7BaseDeal: ['D_100'] },
            { id: 799, stageId: 'DT1038_9:PENDING', ufCrm7BaseDeal: ['D_100'] },
            { id: 640, stageId: 'DT1038_9:PLAN', ufCrm7BaseDeal: ['D_100'] },
        ]);

        const open = await lookup.findOpenElement(makeInfo(), job());

        expect(open?.id).toBe(799);
    });

    it('на портале нет открытых стадий — в Битрикс не ходим вовсе', async () => {
        const listAll = jest.fn();
        const lookup = new ZprElementLookupService({
            item: { listAll },
        } as never);

        const open = await lookup.findOpenElement(
            makeInfo({ stageIdByCode: {} }),
            job(),
        );

        expect(open).toBeNull();
        expect(listAll).not.toHaveBeenCalled();
    });
});
