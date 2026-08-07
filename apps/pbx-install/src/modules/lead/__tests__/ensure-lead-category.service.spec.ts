import { EnsureLeadCategoryService } from '../services/stages/ensure-lead-category.service';
import { PbxEntityGroupEnum } from '../../shared/entity/field/parse-entity-field.service';

describe('EnsureLeadCategoryService', () => {
    const makeService = (categories: unknown[]) => {
        const portalService = {
            getPortalByDomain: jest.fn().mockResolvedValue({ id: 1 }),
        };
        const portalLeadService = {
            findByPortalId: jest.fn().mockResolvedValue({ id: 12 }),
            create: jest.fn(),
        };
        const create = jest
            .fn()
            .mockImplementation((dto: { group: string }) =>
                Promise.resolve({ id: 100, ...dto }),
            );
        const update = jest.fn().mockResolvedValue({});
        const categoryService = {
            findByEntity: jest.fn().mockResolvedValue(categories),
            create,
            update,
        };
        const service = new EnsureLeadCategoryService(
            portalService as never,
            portalLeadService as never,
            categoryService as never,
        );
        return { service, create, update };
    };

    it('SALES и SERVICE получают РАЗНЫЕ категории (не existing[0])', async () => {
        const { service, create } = makeService([
            { id: 41, group: 'sales', code: 'lead_sales' },
        ]);

        const sales = await service.ensure(
            'example.bitrix24.ru',
            PbxEntityGroupEnum.SALES,
        );
        expect(sales.categoryId).toBe(41);
        expect(create).not.toHaveBeenCalled();

        const serviceGroup = await service.ensure(
            'example.bitrix24.ru',
            PbxEntityGroupEnum.SERVICE,
        );
        expect(serviceGroup.categoryId).toBe(100);
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ group: 'service', code: 'lead_service' }),
        );
    });

    it('единственная legacy-строка без группы усыновляется, а не дублируется', async () => {
        const { service, create, update } = makeService([
            { id: 7, group: '', code: '' },
        ]);

        const anchor = await service.ensure(
            'example.bitrix24.ru',
            PbxEntityGroupEnum.SALES,
        );

        expect(anchor.categoryId).toBe(7);
        expect(update).toHaveBeenCalledWith(7, {
            group: PbxEntityGroupEnum.SALES,
            code: 'lead_sales',
        });
        expect(create).not.toHaveBeenCalled();
    });

    it('find с группой возвращает категорию группы; legacy — как fallback', async () => {
        const withGroups = makeService([
            { id: 41, group: 'sales', code: 'lead_sales' },
            { id: 42, group: 'service', code: 'lead_service' },
        ]);
        const found = await withGroups.service.find(
            'example.bitrix24.ru',
            PbxEntityGroupEnum.SERVICE,
        );
        expect(found?.categoryId).toBe(42);

        const legacy = makeService([{ id: 7, group: '', code: '' }]);
        const fallback = await legacy.service.find(
            'example.bitrix24.ru',
            PbxEntityGroupEnum.SALES,
        );
        expect(fallback?.categoryId).toBe(7);
    });
});
