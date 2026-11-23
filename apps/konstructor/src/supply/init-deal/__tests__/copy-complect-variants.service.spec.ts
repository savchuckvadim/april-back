import { BitrixService } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { BxDocumentDeal } from 'generated/prisma';
import { InnerDealService } from '../../../modules/inner-deal/services/inner-deal.service';
import {
    ComplectComposition,
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '../../../modules/inner-deal/type/complect-composition.type';
import { CopyComplectVariantsService } from '../services/copy-complect-variants.service';

/** Настройки строк сделок со слепком: в тестах важна только колонка настроек. */
interface DealRows {
    /** Настройки строки исходной сделки (100); не заданы — настроек нет. */
    source?: ComplectComposition | null;
    /** Настройки строки целевой сделки (200), как их принёс слепок; по умолчанию те же, что у источника. */
    target?: ComplectComposition | null;
    /** Слепок сделки до цели не доехал: строки у цели нет. */
    targetMissing?: boolean;
}

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

    const dealRow = (
        settings: ComplectComposition | null,
    ): Partial<BxDocumentDeal> => ({
        id: BigInt(1),
        settings: settings === null ? null : JSON.stringify(settings),
    });

    /** Настройки сборки комплекта, как их хранит слепок сделки. */
    const composition = (
        over: Partial<ComplectComposition> = {},
    ): ComplectComposition => ({
        mode: ComplectModeEnum.MULTI_CONTRACT,
        offer: {
            infoblocks: ComplectOfferInfoblocksEnum.MERGED,
            showAlternatives: true,
        },
        openVariantSmartId: null,
        ...over,
    });

    /**
     * `listVariants` спрашивают дважды: про исходную сделку и про целевую —
     * «не переносили ли уже». Целевая по умолчанию пуста. Строки сделок со
     * слепком (`findSnapshot`) по умолчанию без настроек.
     */
    const makeInnerDeal = (
        variants: Partial<BxDocumentDeal>[],
        targetVariants: Partial<BxDocumentDeal>[] = [],
        rows: DealRows = {},
    ) => {
        const listVariants = jest
            .fn()
            .mockImplementation((_domain: string, dealId: number) =>
                Promise.resolve(dealId === 200 ? targetVariants : variants),
            );
        const copySnapshot = jest
            .fn()
            .mockResolvedValue({ copied: true, reason: null, deal: null });

        const sourceSettings = rows.source ?? null;
        const targetSettings =
            rows.target === undefined ? sourceSettings : rows.target;
        const findSnapshot = jest
            .fn()
            .mockImplementation((_domain: string, dealId: number) => {
                if (dealId === 100) {
                    return Promise.resolve(dealRow(sourceSettings));
                }
                if (dealId === 200 && !rows.targetMissing) {
                    return Promise.resolve(dealRow(targetSettings));
                }
                return Promise.resolve(null);
            });
        const updateSettings = jest.fn().mockResolvedValue(dealRow(null));

        const innerDeal = {
            listVariants,
            copySnapshot,
            findSnapshot,
            updateSettings,
        } as unknown as InnerDealService;

        return {
            innerDeal,
            listVariants,
            copySnapshot,
            findSnapshot,
            updateSettings,
        };
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
            movedSourceIds: [],
            notMovedSourceIds: [],
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
            movedSourceIds: [],
            notMovedSourceIds: [],
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

        expect(result).toEqual({
            found: 2,
            selected: 2,
            copied: 2,
            movedSourceIds: [5001, 5002],
            notMovedSourceIds: [],
        });
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
            movedSourceIds: [5001],
            // отклонённый уже закрыт — робот не переписывает решение менеджера
            notMovedSourceIds: [],
        });
        expect(itemAdd).toHaveBeenCalledTimes(1);
    });

    it('открытый вариант («Текущий») не отменяет остальные — едут все незакрытые', async () => {
        // стадия «Текущий» ставится автоматически тому набору, который открыт
        // в конструкторе; отбор к переносу она менять не должна
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
            selected: 2,
            copied: 2,
            movedSourceIds: [5001, 5002],
            notMovedSourceIds: [],
        });
        expect(itemAdd).toHaveBeenCalledTimes(2);
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
            movedSourceIds: [],
            notMovedSourceIds: [],
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
            movedSourceIds: [5002],
            notMovedSourceIds: [],
        });
    });

    describe('открытый вариант в настройках целевой сделки', () => {
        const TWO = [{ smartId: 5001 }, { smartId: 5002 }];

        const setup = (
            rows: DealRows,
            over: {
                variants?: Partial<BxDocumentDeal>[];
                targetVariants?: Partial<BxDocumentDeal>[];
                stageById?: Record<number, string>;
            } = {},
        ) => {
            const mocks = makeBitrix(over.stageById);
            const inner = makeInnerDeal(
                over.variants ?? TWO,
                over.targetVariants ?? [],
                rows,
            );
            const service = new CopyComplectVariantsService(
                mocks.bitrix,
                portalModelWith({ entityTypeId: ENTITY_TYPE_ID, crm: 'T416_' }),
                inner.innerDeal,
            );
            return { service, ...mocks, ...inner };
        };

        it('указатель получает id копии открытого варианта, остальные настройки остаются', async () => {
            const { service, updateSettings } = setup({
                source: composition({ openVariantSmartId: 5002 }),
            });

            await service.copy('d.ru', 100, 200, 7);

            // копии создаются в порядке вариантов: 5001 → 9001, 5002 → 9002
            expect(updateSettings).toHaveBeenCalledTimes(1);
            expect(updateSettings).toHaveBeenCalledWith('d.ru', 200, {
                mode: ComplectModeEnum.MULTI_CONTRACT,
                offer: {
                    infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                    showAlternatives: true,
                },
                openVariantSmartId: 9002,
            });
        });

        it('открытый вариант не переехал — указатель обнуляется', async () => {
            // отклонённый вариант остаётся на исходной сделке
            const { service, updateSettings } = setup(
                { source: composition({ openVariantSmartId: 5002 }) },
                { stageById: { 5002: 'DT1046_1:REJECTED' } },
            );

            const result = await service.copy('d.ru', 100, 200, 7);

            expect(result.movedSourceIds).toEqual([5001]);
            expect(updateSettings).toHaveBeenCalledWith(
                'd.ru',
                200,
                expect.objectContaining({ openVariantSmartId: null }),
            );
        });

        it('копия открытого варианта не создалась — указатель обнуляется', async () => {
            const { service, updateSettings, itemAdd } = setup({
                source: composition({ openVariantSmartId: 5001 }),
            });
            itemAdd.mockResolvedValueOnce({ result: { item: {} } });

            const result = await service.copy('d.ru', 100, 200, 7);

            expect(result.movedSourceIds).toEqual([5002]);
            expect(updateSettings).toHaveBeenCalledWith(
                'd.ru',
                200,
                expect.objectContaining({ openVariantSmartId: null }),
            );
        });

        it('остальное в настройках цели остаётся таким, каким его принёс слепок', async () => {
            const { service, updateSettings } = setup({
                source: composition({ openVariantSmartId: 5001 }),
                target: composition({
                    mode: ComplectModeEnum.SINGLE_CONTRACT,
                    openVariantSmartId: 5001,
                }),
            });

            await service.copy('d.ru', 100, 200, 7);

            expect(updateSettings).toHaveBeenCalledWith('d.ru', 200, {
                mode: ComplectModeEnum.SINGLE_CONTRACT,
                offer: {
                    infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                    showAlternatives: true,
                },
                openVariantSmartId: 9001,
            });
        });

        it('у цели настроек нет — берутся настройки источника с новым id', async () => {
            const { service, updateSettings } = setup({
                source: composition({ openVariantSmartId: 5001 }),
                target: null,
            });

            await service.copy('d.ru', 100, 200, 7);

            expect(updateSettings).toHaveBeenCalledWith('d.ru', 200, {
                mode: ComplectModeEnum.MULTI_CONTRACT,
                offer: {
                    infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                    showAlternatives: true,
                },
                openVariantSmartId: 9001,
            });
        });

        it('повторный прогон настройки целевой сделки не трогает', async () => {
            const { service, itemAdd, updateSettings } = setup(
                {
                    source: composition({ openVariantSmartId: 5001 }),
                    // в цели id давно новые
                    target: composition({ openVariantSmartId: 9001 }),
                },
                // варианты в цели уже есть — значит перенос был
                { targetVariants: [{ smartId: 9001 }] },
            );

            await service.copy('d.ru', 100, 200, 7);

            expect(itemAdd).not.toHaveBeenCalled();
            expect(updateSettings).not.toHaveBeenCalled();
        });

        it('у источника нет открытого варианта — настройки не пишем', async () => {
            const { service, updateSettings } = setup({
                source: composition({ openVariantSmartId: null }),
            });

            await service.copy('d.ru', 100, 200, 7);

            expect(updateSettings).not.toHaveBeenCalled();
        });

        it('у источника нет настроек вовсе — настройки не пишем', async () => {
            const { service, updateSettings } = setup({ source: null });

            const result = await service.copy('d.ru', 100, 200, 7);

            expect(result.movedSourceIds).toEqual([5001, 5002]);
            expect(updateSettings).not.toHaveBeenCalled();
        });

        it('слепок сделки до цели не доехал — строку с одними настройками не заводим', async () => {
            const { service, updateSettings } = setup({
                source: composition({ openVariantSmartId: 5001 }),
                targetMissing: true,
            });

            const result = await service.copy('d.ru', 100, 200, 7);

            expect(result.movedSourceIds).toEqual([5001, 5002]);
            expect(updateSettings).not.toHaveBeenCalled();
        });

        it('настройки пишутся после копирования слепков вариантов', async () => {
            const { service, updateSettings, copySnapshot } = setup({
                source: composition({ openVariantSmartId: 5001 }),
            });

            await service.copy('d.ru', 100, 200, 7);

            const lastSnapshot = Math.max(
                ...copySnapshot.mock.invocationCallOrder,
            );
            expect(updateSettings.mock.invocationCallOrder[0]).toBeGreaterThan(
                lastSnapshot,
            );
        });

        it('сбой записи настроек не роняет перенос: исходники всё равно закрываются', async () => {
            const { service, updateSettings } = setup({
                source: composition({ openVariantSmartId: 5001 }),
            });
            updateSettings.mockRejectedValueOnce(new Error('БД недоступна'));

            await expect(
                service.copy('d.ru', 100, 200, 7),
            ).resolves.toMatchObject({
                copied: 2,
                movedSourceIds: [5001, 5002],
            });
        });

        it('сбой чтения настроек не роняет перенос', async () => {
            const { service, findSnapshot, updateSettings } = setup({
                source: composition({ openVariantSmartId: 5001 }),
            });
            findSnapshot.mockRejectedValue(new Error('БД недоступна'));

            await expect(
                service.copy('d.ru', 100, 200, 7),
            ).resolves.toMatchObject({
                copied: 2,
                movedSourceIds: [5001, 5002],
            });
            expect(updateSettings).not.toHaveBeenCalled();
        });
    });
});
