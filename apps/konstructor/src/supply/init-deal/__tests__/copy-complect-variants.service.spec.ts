import { BitrixService } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { BxDocumentDeal } from 'generated/prisma';
import { InnerDealService } from '../../../modules/inner-deal/services/inner-deal.service';
import { CopyComplectVariantsService } from '../services/copy-complect-variants.service';

/**
 * Вместе со сделкой в отдел сервиса переезжают ВСЕ наборы комплектов: у
 * каждого свой договор, в том числе другого типа. На каждый вариант заводится
 * свой элемент смарта на новой сделке.
 */
describe('CopyComplectVariantsService', () => {
    const ENTITY_TYPE_ID = 1046;

    const portalModelWith = (
        smart: { entityTypeId: number; crm: string } | undefined,
    ): PortalModel =>
        ({ getSmartByType: () => smart }) as unknown as PortalModel;

    const makeBitrix = (stageById: Record<number, string> = {}) => {
        let nextId = 9001;
        const itemGet = jest.fn().mockImplementation((id: string) =>
            Promise.resolve({
                result: {
                    item: {
                        id: Number(id),
                        title: `вариант ${id}`,
                        parentId2: 100,
                        stageId: stageById[Number(id)] ?? 'DT1046_1:DRAFT',
                        createdTime: '2026-01-01',
                        ufCrm15VariantName: `набор ${id}`,
                    },
                },
            }),
        );
        const itemAdd = jest
            .fn()
            .mockImplementation(() =>
                Promise.resolve({ result: { item: { id: nextId++ } } }),
            );
        const rowList = jest.fn().mockResolvedValue({
            result: { productRows: [{ id: 1, productName: 'Гарант' }] },
        });
        const rowSet = jest.fn().mockResolvedValue({ result: true });

        const bitrix = {
            item: { get: itemGet, add: itemAdd },
            productRow: { list: rowList, set: rowSet },
        } as unknown as BitrixService;

        return { bitrix, itemGet, itemAdd, rowList, rowSet };
    };

    /**
     * `listVariants` спрашивают дважды: про исходную сделку и про целевую —
     * «не переносили ли уже». Целевая по умолчанию пуста.
     */
    const makeInnerDeal = (
        variants: Partial<BxDocumentDeal>[],
        targetVariants: Partial<BxDocumentDeal>[] = [],
    ) => {
        const listVariants = jest
            .fn()
            .mockImplementation((_domain: string, dealId: number) =>
                Promise.resolve(dealId === 200 ? targetVariants : variants),
            );
        const copySnapshot = jest
            .fn()
            .mockResolvedValue({ copied: true, reason: null, deal: null });
        const innerDeal = {
            listVariants,
            copySnapshot,
        } as unknown as InnerDealService;

        return { innerDeal, listVariants, copySnapshot };
    };

    it('смарт на портале не установлен — шаг проходит вхолостую', async () => {
        const { bitrix } = makeBitrix();
        const { innerDeal, listVariants } = makeInnerDeal([{ smartId: 5001 }]);
        const service = new CopyComplectVariantsService(
            bitrix,
            portalModelWith(undefined),
            innerDeal,
        );

        expect(await service.copy('d.ru', 100, 200, 7)).toEqual({
            found: 0,
            selected: 0,
            copied: 0,
        });
        expect(listVariants).not.toHaveBeenCalled();
    });

    it('вариантов нет — ничего не создаём', async () => {
        const { bitrix, itemAdd } = makeBitrix();
        const service = new CopyComplectVariantsService(
            bitrix,
            portalModelWith({ entityTypeId: ENTITY_TYPE_ID, crm: 'T416_' }),
            makeInnerDeal([]).innerDeal,
        );

        expect(await service.copy('d.ru', 100, 200, 7)).toEqual({
            found: 0,
            selected: 0,
            copied: 0,
        });
        expect(itemAdd).not.toHaveBeenCalled();
    });

    it('на каждый вариант создаёт свой элемент на новой сделке', async () => {
        const { bitrix, itemAdd } = makeBitrix();
        const { innerDeal } = makeInnerDeal([
            { smartId: 5001 },
            { smartId: 5002 },
        ]);
        const service = new CopyComplectVariantsService(
            bitrix,
            portalModelWith({ entityTypeId: ENTITY_TYPE_ID, crm: 'T416_' }),
            innerDeal,
        );

        const result = await service.copy('d.ru', 100, 200, 7);

        expect(result).toEqual({ found: 2, selected: 2, copied: 2 });
        expect(itemAdd).toHaveBeenCalledTimes(2);

        const [entityTypeId, fields] = itemAdd.mock.calls[0] as [
            string,
            Record<string, unknown>,
        ];
        expect(entityTypeId).toBe(String(ENTITY_TYPE_ID));
        // новая сделка, а не исходная
        expect(fields.parentId2).toBe(200);
        // значения варианта переносятся
        expect(fields.ufCrm15VariantName).toBe('набор 5001');
        // служебные поля старого элемента — нет
        expect(fields.id).toBeUndefined();
        expect(fields.createdTime).toBeUndefined();
        // а стадия переносится: это признак участия, выбор менеджера
        expect(fields.stageId).toBe('DT1046_1:DRAFT');
    });

    it('отклонённый вариант в новую сделку не едет', async () => {
        const { bitrix, itemAdd } = makeBitrix({
            5002: 'DT1046_1:REJECTED',
        });
        const service = new CopyComplectVariantsService(
            bitrix,
            portalModelWith({ entityTypeId: ENTITY_TYPE_ID, crm: 'T416_' }),
            makeInnerDeal([{ smartId: 5001 }, { smartId: 5002 }]).innerDeal,
        );

        expect(await service.copy('d.ru', 100, 200, 7)).toEqual({
            found: 2,
            selected: 1,
            copied: 1,
        });
        expect(itemAdd).toHaveBeenCalledTimes(1);
    });

    it('есть текущий вариант — едет только он, черновики остаются', async () => {
        const { bitrix, itemAdd } = makeBitrix({
            5002: 'DT1046_1:CURRENT',
        });
        const service = new CopyComplectVariantsService(
            bitrix,
            portalModelWith({ entityTypeId: ENTITY_TYPE_ID, crm: 'T416_' }),
            makeInnerDeal([{ smartId: 5001 }, { smartId: 5002 }]).innerDeal,
        );

        expect(await service.copy('d.ru', 100, 200, 7)).toEqual({
            found: 2,
            selected: 1,
            copied: 1,
        });
        const [, fields] = itemAdd.mock.calls[0] as [
            string,
            Record<string, unknown>,
        ];
        expect(fields.ufCrm15VariantName).toBe('набор 5002');
    });

    it('слепок каждого варианта привязывается к НОВОМУ элементу смарта', async () => {
        const { bitrix } = makeBitrix();
        const { innerDeal, copySnapshot } = makeInnerDeal([{ smartId: 5001 }]);
        const service = new CopyComplectVariantsService(
            bitrix,
            portalModelWith({ entityTypeId: ENTITY_TYPE_ID, crm: 'T416_' }),
            innerDeal,
        );

        await service.copy('d.ru', 100, 200, 7);

        expect(copySnapshot).toHaveBeenCalledWith({
            domain: 'd.ru',
            source: { kind: 'variant', dealId: 100, variantSmartId: 5001 },
            targetDealId: 200,
            variantSmartId: 9001,
            userId: 7,
            department: 'service',
            force: true,
        });
    });

    it('товарные строки переносятся из элемента в элемент без старых id', async () => {
        const { bitrix, rowList, rowSet } = makeBitrix();
        const service = new CopyComplectVariantsService(
            bitrix,
            portalModelWith({ entityTypeId: ENTITY_TYPE_ID, crm: 'T416_' }),
            makeInnerDeal([{ smartId: 5001 }]).innerDeal,
        );

        await service.copy('d.ru', 100, 200, 7);

        // ownerType берётся из smarts.crm без хвостового подчёркивания
        expect(rowList).toHaveBeenCalledWith({
            '=ownerType': 'T416',
            '=ownerId': 5001,
        });
        const [payload] = rowSet.mock.calls[0] as [
            { ownerId: number; productRows: { id?: number }[] },
        ];
        expect(payload.ownerId).toBe(9001);
        expect(payload.productRows[0].id).toBeUndefined();
    });

    it('повторный прогон робота не плодит копии вариантов', async () => {
        const { bitrix, itemAdd } = makeBitrix();
        const service = new CopyComplectVariantsService(
            bitrix,
            portalModelWith({ entityTypeId: ENTITY_TYPE_ID, crm: 'T416_' }),
            // в целевой сделке варианты уже есть — значит перенос был
            makeInnerDeal([{ smartId: 5001 }], [{ smartId: 9001 }]).innerDeal,
        );

        expect(await service.copy('d.ru', 100, 200, 7)).toEqual({
            found: 1,
            selected: 0,
            copied: 0,
        });
        expect(itemAdd).not.toHaveBeenCalled();
    });

    it('элемент не прочитался — остальные варианты всё равно переезжают', async () => {
        const { bitrix, itemGet } = makeBitrix();
        itemGet.mockResolvedValueOnce({ result: { item: null } });
        const service = new CopyComplectVariantsService(
            bitrix,
            portalModelWith({ entityTypeId: ENTITY_TYPE_ID, crm: 'T416_' }),
            makeInnerDeal([{ smartId: 5001 }, { smartId: 5002 }]).innerDeal,
        );

        expect(await service.copy('d.ru', 100, 200, 7)).toEqual({
            found: 2,
            selected: 1,
            copied: 1,
        });
    });
});
