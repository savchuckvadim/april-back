import { BitrixService } from '@/modules/bitrix';
import {
    BtxCategoryRepository,
    BtxStageRepository,
} from '@lib/portal-lib/pbx-domain';
import { InstallRpaCategoriesService } from './install-rpa-categories.service';
import { RpaCategory } from '../../type/parse.type';

function makeCategory(): RpaCategory {
    return {
        id: '1',
        entityTypeId: '158',
        type: 'supply',
        group: 'service',
        name: 'rpa_supply',
        title: 'rpa_supply',
        bitrixId: '158',
        bitrixCamelId: '',
        code: 'rpa_supply',
        isActive: true,
        isNeedUpdate: true,
        order: 10,
        isDefault: true,
        stages: [
            {
                id: '0',
                name: 'Запуск',
                title: 'Запуск',
                bitrixId: 'NEW',
                color: '#eef0e6',
                code: 'rpa_supply_new',
                semantic: '',
                isActive: true,
                isNeedUpdate: true,
                order: 10,
                isFirst: true,
                isSuccess: false,
                isFail: false,
            },
            {
                id: '1',
                name: 'Утверждено',
                title: 'Утверждено',
                bitrixId: 'SUCCESS',
                color: '#bbed21',
                code: 'rpa_supply_success',
                semantic: 'SUCCESS',
                isActive: true,
                isNeedUpdate: true,
                order: 20,
                isFirst: false,
                isSuccess: true,
                isFail: false,
            },
        ],
    };
}

describe('InstallRpaCategoriesService', () => {
    let service: InstallRpaCategoriesService;
    let categoryRepo: jest.Mocked<
        Pick<BtxCategoryRepository, 'findByEntity' | 'create' | 'update'>
    >;
    let stageRepo: jest.Mocked<
        Pick<BtxStageRepository, 'deleteByCategoryId' | 'createMany'>
    >;
    let rpaStage: {
        listForType: jest.Mock;
        add: jest.Mock;
        update: jest.Mock;
    };
    let bitrix: BitrixService;

    beforeEach(() => {
        categoryRepo = {
            findByEntity: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        };
        stageRepo = {
            deleteByCategoryId: jest.fn().mockResolvedValue(0),
            createMany: jest.fn().mockResolvedValue(2),
        };
        rpaStage = {
            listForType: jest.fn(),
            add: jest.fn().mockResolvedValue({ result: { stage: {} } }),
            update: jest.fn().mockResolvedValue({ result: { stage: {} } }),
        };
        bitrix = { rpaStage } as unknown as BitrixService;
        service = new InstallRpaCategoriesService(
            categoryRepo as unknown as BtxCategoryRepository,
            stageRepo as unknown as BtxStageRepository,
        );
    });

    it('создаёт категорию, добавляет отсутствующие стадии и зеркалит их', async () => {
        categoryRepo.findByEntity.mockResolvedValue([]);
        categoryRepo.create.mockResolvedValue({ id: 10 } as never);
        // 1-й list — пусто (нечего обновлять), 2-й — созданные стадии с id.
        rpaStage.listForType
            .mockResolvedValueOnce({ result: { stages: [] } })
            .mockResolvedValueOnce({
                result: {
                    stages: [
                        { id: 101, code: 'rpa_supply_new', name: 'Запуск' },
                        {
                            id: 102,
                            code: 'rpa_supply_success',
                            name: 'Утверждено',
                        },
                    ],
                },
            });

        const result = await service.installCategory({
            bitrix,
            rpaTypeId: 158,
            rpaDbId: 5n,
            category: makeCategory(),
        });

        expect(categoryRepo.create).toHaveBeenCalledTimes(1);
        expect(result.portalCategoryId).toBe(10);
        expect(result.stagesAdded).toBe(2);
        expect(result.stagesUpdated).toBe(0);
        expect(rpaStage.add).toHaveBeenCalledTimes(2);

        // Зеркало: сначала чистим по категории, потом createMany с id из Bitrix.
        expect(stageRepo.deleteByCategoryId).toHaveBeenCalledWith(10);
        const rows = stageRepo.createMany.mock.calls[0][0];
        expect(rows).toHaveLength(2);
        expect(rows[0].bitrixId).toBe('101');
        expect(rows[0].btx_category_id).toBe(10n);
    });

    it('обновляет существующую категорию и стадии по code', async () => {
        categoryRepo.findByEntity.mockResolvedValue([{ id: 10 }] as never);
        categoryRepo.update.mockResolvedValue({ id: 10 } as never);
        rpaStage.listForType.mockResolvedValue({
            result: {
                stages: [
                    { id: 101, code: 'rpa_supply_new', name: 'Запуск' },
                    { id: 102, code: 'rpa_supply_success', name: 'Утверждено' },
                ],
            },
        });

        const result = await service.installCategory({
            bitrix,
            rpaTypeId: 158,
            rpaDbId: 5n,
            category: makeCategory(),
        });

        expect(categoryRepo.update).toHaveBeenCalledTimes(1);
        expect(result.stagesUpdated).toBe(2);
        expect(result.stagesAdded).toBe(0);
        expect(rpaStage.update).toHaveBeenCalledTimes(2);
    });
});
