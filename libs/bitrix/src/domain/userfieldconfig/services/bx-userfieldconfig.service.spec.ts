import { BxUserFieldConfigService } from './bx-userfieldconfig.service';
import { UserFieldConfigRepository } from '../repository/userfieldconfig.repository';
import {
    EUserFieldType,
    IUserFieldConfig,
} from '../interface/userfieldconfig.interface';

/**
 * Тесты на `getAllWithItems`: enumeration-поля без `enum` дотягиваются через `get`,
 * остальные не трогаются. `getAll` (пагинация `list`) проверяется косвенно.
 */
describe('BxUserFieldConfigService.getAllWithItems', () => {
    let service: BxUserFieldConfigService;
    let repo: { list: jest.Mock; get: jest.Mock };

    function makeField(overrides: Partial<IUserFieldConfig>): IUserFieldConfig {
        return {
            id: '1',
            entityId: 'RPA_1',
            fieldName: 'UF_RPA_1_X',
            userTypeId: EUserFieldType.STRING,
            xmlId: 'x',
            multiple: 'N',
            mandatory: 'N',
            showFilter: 'Y',
            showInList: 'Y',
            isSearchable: 'Y',
            ...overrides,
        };
    }

    beforeEach(() => {
        service = new BxUserFieldConfigService();
        repo = { list: jest.fn(), get: jest.fn() };
        (service as unknown as { repo: UserFieldConfigRepository }).repo =
            repo as unknown as UserFieldConfigRepository;
    });

    /** Одна непустая страница, затем пустая — чтобы `getAll` остановился. */
    function mockOnePage(fields: IUserFieldConfig[]): void {
        repo.list
            .mockResolvedValueOnce({ result: { fields } })
            .mockResolvedValue({ result: { fields: [] } });
    }

    it('дотягивает enum для enumeration-поля без enum', async () => {
        const enumItems = [
            {
                id: '4369',
                value: 'Занесена в АРМ',
                def: 'N',
                sort: 100,
                xmlId: 'in_arm',
            },
        ];
        mockOnePage([
            makeField({
                id: '2389',
                userTypeId: EUserFieldType.ENUMERATION,
                fieldName: 'UF_RPA_1_IN_ARM',
            }),
        ]);
        repo.get.mockResolvedValue({ result: { field: { enum: enumItems } } });

        const result = await service.getAllWithItems('rpa', {
            entityId: 'RPA_1',
        });

        expect(repo.get).toHaveBeenCalledWith({ moduleId: 'rpa', id: '2389' });
        expect(result[0].enum).toEqual(enumItems);
    });

    it('не трогает не-enumeration поля', async () => {
        mockOnePage([makeField({ userTypeId: EUserFieldType.STRING })]);

        const result = await service.getAllWithItems('rpa', {
            entityId: 'RPA_1',
        });

        expect(repo.get).not.toHaveBeenCalled();
        expect(result[0].enum).toBeUndefined();
    });

    it('не запрашивает enum повторно, если он уже есть', async () => {
        mockOnePage([
            makeField({
                userTypeId: EUserFieldType.ENUMERATION,
                enum: [{ id: '1', value: 'v', def: 'N', sort: 1, xmlId: 'c' }],
            }),
        ]);

        await service.getAllWithItems('rpa', { entityId: 'RPA_1' });

        expect(repo.get).not.toHaveBeenCalled();
    });

    it('пропускает enumeration-поле без id', async () => {
        mockOnePage([
            makeField({
                id: undefined,
                userTypeId: EUserFieldType.ENUMERATION,
            }),
        ]);

        await service.getAllWithItems('rpa', { entityId: 'RPA_1' });

        expect(repo.get).not.toHaveBeenCalled();
    });
});
