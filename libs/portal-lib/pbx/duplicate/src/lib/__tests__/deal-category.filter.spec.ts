import { resolveDuplicateDealCategories } from '../deal-category.filter';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';

const portalModel = (
    categories: Partial<Record<string, { bitrixId: string }>>,
) => ({
    getDealCategoryByCode: (code: PbxDealCategoryCodeEnum) =>
        categories[code] as never,
});

describe('resolveDuplicateDealCategories', () => {
    it('отдаёт CATEGORY_ID воронки ОП; презентации и ХО не участвуют', () => {
        const result = resolveDuplicateDealCategories(
            portalModel({
                [PbxDealCategoryCodeEnum.sales_base]: { bitrixId: '5' },
                [PbxDealCategoryCodeEnum.sales_presentation]: {
                    bitrixId: '7',
                },
                [PbxDealCategoryCodeEnum.sales_xo]: { bitrixId: '9' },
            }),
        );
        expect(result.allowedBitrixIds).toEqual([5]);
        expect(result.warnings).toEqual([]);
    });

    it('includeTmc добавляет воронку ТМЦ', () => {
        const result = resolveDuplicateDealCategories(
            portalModel({
                [PbxDealCategoryCodeEnum.sales_base]: { bitrixId: '5' },
                [PbxDealCategoryCodeEnum.tmc_base]: { bitrixId: '11' },
            }),
            { includeTmc: true },
        );
        expect(result.allowedBitrixIds).toEqual([5, 11]);
    });

    it('несконфигурированная воронка — ПУСТОЙ список + warning, НЕ «все воронки»', () => {
        const result = resolveDuplicateDealCategories(portalModel({}));
        expect(result.allowedBitrixIds).toEqual([]);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('sales_base');
    });
});
