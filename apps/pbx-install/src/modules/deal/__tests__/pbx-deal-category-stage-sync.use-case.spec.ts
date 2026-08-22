import { NotFoundException } from '@nestjs/common';
import { Category, Stage } from '@app/pbx-install/shared';
import { PbxEntityGroupEnum } from '@app/pbx-install/shared/entity/field/parse-entity-field.service';
import { ParseCategoryNameEnum } from '../services/categories/parse-category.service';
import { SyncDealCategoryStageDto } from '../dto/manage-deal-category.dto';
import { PbxDealCategoryStageSyncUseCase } from '../use-cases/category/pbx-deal-category-stage-sync.use-case';

/**
 * Поштучная синхронизация стадии воронки сделки.
 *
 * Что закрывает тест:
 *  - источник правды — Excel-шаблон: нет строки в шаблоне → 404 ДО похода
 *    на порталы (иначе прогон по всем порталам впустую);
 *  - `reorder` включён по умолчанию;
 *  - при `domain: 'all'` шаблон читается один раз, а неподготовленный портал
 *    помечается ok:false и не рушит обработку остальных.
 */

const GROUP = PbxEntityGroupEnum.SALES;
const CATEGORY_CODE = ParseCategoryNameEnum.sales_base;

const stage = (code: string, order: number): Stage =>
    ({
        id: String(order),
        entityTypeId: '2',
        entityType: 'deal',
        parentType: 'sales',
        type: 'P',
        group: 'sales',
        name: code,
        title: code,
        bitrixId: code.toUpperCase(),
        isActive: true,
        smartBitrixId: 'DEAL_STAGE',
        color: '#2D0B0D',
        code,
        isNeedUpdate: true,
        order,
        bitrixEnitiyId: '',
        isDefault: 'N',
    }) as Stage;

const TEMPLATE_STAGES = [stage('sales_refine', 5), stage('sales_not_ca', 14)];

const template = (over: Partial<Category> = {}): Category =>
    ({
        id: '0',
        entityTypeId: '2',
        entityType: 'deal',
        type: 'deal',
        group: 'sales',
        name: 'ОП Основная',
        title: 'ОП Основная',
        bitrixId: '',
        bitrixCamelId: '',
        code: CATEGORY_CODE,
        isActive: true,
        isNeedUpdate: true,
        order: 1,
        isDefault: false,
        stages: TEMPLATE_STAGES,
        ...over,
    }) as Category;

const dto = (over: Partial<SyncDealCategoryStageDto> = {}) =>
    ({
        domain: 'example.bitrix24.ru',
        group: GROUP,
        categoryCode: CATEGORY_CODE,
        stageCode: 'sales_not_ca',
        ...over,
    }) as SyncDealCategoryStageDto;

const makeHarness = (
    options: {
        categories?: Category[];
        domains?: string[];
        portalDeal?: unknown;
        category?: unknown;
        syncImpl?: jest.Mock;
    } = {},
) => {
    const parseCategoryService = {
        getParsedData: jest.fn().mockResolvedValue({
            count: 1,
            categories: options.categories ?? [template()],
        }),
    };
    const resolver = {
        resolveDomains: jest
            .fn()
            .mockResolvedValue(options.domains ?? ['example.bitrix24.ru']),
        resolvePortalDeal: jest
            .fn()
            .mockResolvedValue(
                options.portalDeal === undefined
                    ? { portalId: 3, dealId: 9, bitrix: {}, parent: {} }
                    : options.portalDeal,
            ),
        findCategoryByCode: jest
            .fn()
            .mockResolvedValue(
                options.category === undefined
                    ? { id: 42, bitrixId: '7', code: CATEGORY_CODE, stages: [] }
                    : options.category,
            ),
    };
    const stageSync = {
        syncSingleStage:
            options.syncImpl ??
            jest.fn().mockResolvedValue({
                statusId: 'C7:SALES_NOT_CA',
                bxAction: 'created',
                bxId: 555,
                portalStageId: 101,
                portalAction: 'created',
                reorderedStatusIds: [],
            }),
    };
    const useCase = new PbxDealCategoryStageSyncUseCase(
        parseCategoryService as never,
        resolver as never,
        stageSync as never,
        {} as never,
    );
    return { useCase, parseCategoryService, resolver, stageSync };
};

describe('PbxDealCategoryStageSyncUseCase', () => {
    describe('шаблон — источник правды', () => {
        it('передаёт в синк строку стадии из шаблона и всю лестницу воронки', async () => {
            const h = makeHarness();
            await h.useCase.syncStage(dto());

            expect(h.stageSync.syncSingleStage).toHaveBeenCalledWith(
                expect.objectContaining({
                    bxCategoryId: 7,
                    portalCategoryId: 42,
                    stage: expect.objectContaining({
                        code: 'sales_not_ca',
                    }) as unknown,
                    templateStages: TEMPLATE_STAGES,
                }),
            );
        });

        it('нет строки стадии в шаблоне → 404 и ни одного похода на портал', async () => {
            const h = makeHarness();
            await expect(
                h.useCase.syncStage(dto({ stageCode: 'sales_unknown' })),
            ).rejects.toBeInstanceOf(NotFoundException);
            expect(h.resolver.resolveDomains).not.toHaveBeenCalled();
            expect(h.stageSync.syncSingleStage).not.toHaveBeenCalled();
        });

        it('нет воронки в шаблоне → 404', async () => {
            const h = makeHarness({ categories: [] });
            await expect(h.useCase.syncStage(dto())).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });
    });

    describe('reorder', () => {
        it('включён, когда флаг не передан', async () => {
            const h = makeHarness();
            await h.useCase.syncStage(dto());

            expect(h.stageSync.syncSingleStage).toHaveBeenCalledWith(
                expect.objectContaining({ reorder: true }),
            );
        });

        it('выключается явным false', async () => {
            const h = makeHarness();
            await h.useCase.syncStage(dto({ reorder: false }));

            expect(h.stageSync.syncSingleStage).toHaveBeenCalledWith(
                expect.objectContaining({ reorder: false }),
            );
        });
    });

    describe('domain: all', () => {
        const domains = ['a.bitrix24.ru', 'b.bitrix24.ru'];

        it('шаблон читается один раз на все порталы', async () => {
            const h = makeHarness({ domains });
            await h.useCase.syncStage(dto({ domain: 'all' }));

            expect(h.parseCategoryService.getParsedData).toHaveBeenCalledTimes(
                1,
            );
            expect(h.stageSync.syncSingleStage).toHaveBeenCalledTimes(2);
        });

        /*
         * Один неподготовленный портал не должен обрывать раскатку по
         * остальным — иначе установка стадии на 20 клиентов падает на первом.
         */
        it('портал без сделки-якоря помечается ok:false с объяснением', async () => {
            const h = makeHarness({ domains, portalDeal: null });
            const results = await h.useCase.syncStage(dto({ domain: 'all' }));

            expect(results).toHaveLength(2);
            expect(results.every(r => !r.ok)).toBe(true);
            expect(results[0].error).toContain('PortalDB');
            expect(h.stageSync.syncSingleStage).not.toHaveBeenCalled();
        });

        it('портал без установленной воронки объясняет, что надо ставить воронку целиком', async () => {
            const h = makeHarness({ category: null });
            const results = await h.useCase.syncStage(dto());

            expect(results[0].ok).toBe(false);
            expect(results[0].error).toContain('воронку целиком');
            expect(h.stageSync.syncSingleStage).not.toHaveBeenCalled();
        });

        it('ошибка синка на одном портале не рушит остальные', async () => {
            const syncImpl = jest
                .fn()
                .mockRejectedValueOnce(new Error('Bitrix 400'))
                .mockResolvedValueOnce({
                    statusId: 'C7:SALES_NOT_CA',
                    bxAction: 'updated',
                    bxId: '900',
                    portalStageId: 77,
                    portalAction: 'updated',
                    reorderedStatusIds: [],
                });
            const h = makeHarness({ domains, syncImpl });
            const results = await h.useCase.syncStage(dto({ domain: 'all' }));

            expect(results[0]).toMatchObject({
                domain: 'a.bitrix24.ru',
                ok: false,
                error: 'Bitrix 400',
            });
            expect(results[1]).toMatchObject({
                domain: 'b.bitrix24.ru',
                ok: true,
            });
        });
    });

    it('успешный результат отдаёт домен, портал и итог синка', async () => {
        const h = makeHarness();
        const results = await h.useCase.syncStage(dto());

        expect(results).toEqual([
            {
                domain: 'example.bitrix24.ru',
                portalId: 3,
                ok: true,
                result: expect.objectContaining({
                    bxAction: 'created',
                }) as unknown,
            },
        ]);
    });
});
