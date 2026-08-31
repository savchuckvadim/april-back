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

    // ─────────── резолв от ПРИВЯЗКИ ЗАДАЧИ (инцидент 31.08) ───────────
    // Задача несёт `T{hex}_{id}` своего элемента; hex(1038) = '40e'.

    it('привязка задачи побеждает более свежий открытый элемент клиента', async () => {
        // Инцидент: у клиента ДВА открытых ЗПР. Эвристика взяла бы самый
        // свежий (99), но отчитываются по задаче элемента 15.
        const spy = makeBitrix({
            itemsById: {
                15: {
                    id: 15,
                    stageId: 'DT1038_9:PLAN',
                    ufCrm7BaseDeal: 100,
                },
            },
            openItems: [
                { id: 15, stageId: 'DT1038_9:PLAN', ufCrm7BaseDeal: 100 },
                { id: 99, stageId: 'DT1038_9:PLAN', ufCrm7BaseDeal: 100 },
            ],
        });
        const lookup = new ZprElementLookupService(spy.bitrix);

        const open = await lookup.findOpenElement(
            makeInfo(),
            job({
                taskCrmBindings: ['L_42', 'D_100', 'CO_431', 'T40e_15'],
            }),
        );

        expect(open?.id).toBe(15);
    });

    it('элемент из привязки закрыт — честный null БЕЗ отката на эвристику', async () => {
        // Иначе закрылся бы ЧУЖОЙ открытый план (99) — ровно то, от чего
        // уходим: слово задачи финально.
        const spy = makeBitrix({
            itemsById: {
                15: { id: 15, stageId: 'DT1038_9:SUCCESS' },
            },
            openItems: [
                { id: 99, stageId: 'DT1038_9:PLAN', ufCrm7BaseDeal: 100 },
            ],
        });
        const lookup = new ZprElementLookupService(spy.bitrix);

        const open = await lookup.findOpenElement(
            makeInfo(),
            job({ taskCrmBindings: ['T40e_15'] }),
        );

        expect(open).toBeNull();
    });

    it('привязки чужого смарта игнорируются — работает эвристика', async () => {
        // T5с2_7 — другой entityTypeId: для нас это не указатель.
        const lookup = lookupOf([
            { id: 601, stageId: 'DT1038_9:PLAN', ufCrm7BaseDeal: ['D_100'] },
        ]);

        const open = await lookup.findOpenElement(
            makeInfo(),
            job({ taskCrmBindings: ['L_42', 'T5c2_7'] }),
        );

        expect(open?.id).toBe(601);
    });

    it('указатель есть, но не читается (сеть) — null, а не чужой элемент', async () => {
        const spy = makeBitrix({
            itemGetError: new Error('network'),
            openItems: [
                { id: 99, stageId: 'DT1038_9:PLAN', ufCrm7BaseDeal: 100 },
            ],
        });
        const lookup = new ZprElementLookupService(spy.bitrix);

        const open = await lookup.findOpenElement(
            makeInfo(),
            job({ taskCrmBindings: ['T40e_15'] }),
        );

        expect(open).toBeNull();
    });

    // ─────────── эвристика: любая связь, а не первая заданная ───────────

    it('элемент без привязки к сделке находится по компании при заданном baseDealId', async () => {
        // Регрессия раннего выхода: baseDealId в джобе есть, но у элемента
        // связь со сделкой не записана (она была $result[...] того же
        // батча) — раньше проверка обрывалась на сделке и элемент терялся,
        // отчёт заводил спонтанный дубль.
        const lookup = lookupOf([
            { id: 630, stageId: 'DT1038_9:PLAN', ufCrm7Company: ['CO_431'] },
        ]);

        const open = await lookup.findOpenElement(makeInfo(), job());

        expect(open?.id).toBe(630);
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
