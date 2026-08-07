import { MapLeadStagesUseCase } from '../use-cases/stage/map-lead-stages.use-case';
import { PbxEntityGroupEnum } from '../../shared/entity/field/parse-entity-field.service';

describe('MapLeadStagesUseCase', () => {
    const makeUseCase = (existing: unknown[]) => {
        const ensure = {
            ensure: jest.fn().mockResolvedValue({ leadId: 12, categoryId: 41 }),
        };
        const deleteFn = jest.fn().mockResolvedValue(true);
        const stageRepository = {
            findByCategoryId: jest.fn().mockResolvedValue(existing),
            create: jest
                .fn()
                .mockImplementation(() => Promise.resolve({ id: 900 })),
            update: jest
                .fn()
                .mockImplementation((id: number) => Promise.resolve({ id })),
            delete: deleteFn,
        };
        const invalidate = jest.fn().mockResolvedValue(undefined);
        const useCase = new MapLeadStagesUseCase(
            ensure as never,
            stageRepository as never,
            { invalidate } as never,
        );
        return { useCase, deleteFn, invalidate, stageRepository };
    };

    it('снятое сопоставление удаляет строку-сироту и сбрасывает кэш портала', async () => {
        const { useCase, deleteFn, invalidate } = makeUseCase([
            { id: 1, code: 'lead_new' },
            { id: 2, code: 'lead_in_work' },
        ]);

        const result = await useCase.apply({
            domain: 'example.bitrix24.ru',
            group: PbxEntityGroupEnum.SALES,
            mappings: [
                { templateStageCode: 'lead_new', bitrixStatusId: 'NEW' },
            ],
        } as never);

        // lead_in_work был в БД, но не в mappings → удалён
        expect(deleteFn).toHaveBeenCalledWith(2);
        expect(result.removed).toEqual(['lead_in_work']);
        expect(invalidate).toHaveBeenCalledWith('example.bitrix24.ru');
    });

    it('install-стадии (installMode=create) снятием сопоставления НЕ удаляются', async () => {
        const { useCase, deleteFn } = makeUseCase([
            { id: 3, code: 'lead_taken_in_work' },
        ]);

        const result = await useCase.apply({
            domain: 'example.bitrix24.ru',
            group: PbxEntityGroupEnum.SALES,
            mappings: [
                { templateStageCode: 'lead_new', bitrixStatusId: 'NEW' },
            ],
        } as never);

        expect(deleteFn).not.toHaveBeenCalled();
        expect(result.removed).toEqual([]);
    });

    it('чужие коды (не из шаблона) не трогаются', async () => {
        const { useCase, deleteFn } = makeUseCase([
            { id: 4, code: 'custom_client_stage' },
        ]);

        await useCase.apply({
            domain: 'example.bitrix24.ru',
            group: PbxEntityGroupEnum.SALES,
            mappings: [
                { templateStageCode: 'lead_new', bitrixStatusId: 'NEW' },
            ],
        } as never);

        expect(deleteFn).not.toHaveBeenCalled();
    });
});
