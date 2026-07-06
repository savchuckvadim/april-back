import { BxListInstallService } from '../services/install/bx-list-install.service';
import { PBXService } from '@/modules/pbx';
import { List } from '../type/parse.type';

/**
 * Тесты BxListInstallService: поиск существующего инфоблока по кандидатам
 * кода (без дубликатов на старых порталах), актуализация NAME, создание нового.
 */
describe('BxListInstallService', () => {
    let getList: jest.Mock;
    let add: jest.Mock;
    let update: jest.Mock;
    let pbxService: PBXService;

    const parsedList: List = {
        id: '0',
        type: 'kpi',
        group: 'sales',
        name: 'ОП KPI',
        code: 'kpi',
        order: 1,
        fields: [],
    };

    beforeEach(() => {
        getList = jest.fn();
        add = jest.fn().mockResolvedValue({ result: 41 });
        update = jest.fn().mockResolvedValue({ result: true });
        pbxService = {
            init: jest.fn().mockResolvedValue({
                bitrix: { list: { getList, add, update } },
            }),
        } as unknown as PBXService;
    });

    function service(): BxListInstallService {
        return new BxListInstallService('test.bitrix24.ru', pbxService);
    }

    it('находит существующий список по коду из шаблона', async () => {
        getList.mockResolvedValue({
            result: [{ ID: '7', CODE: 'kpi', NAME: 'ОП KPI' }],
        });

        const result = await service().ensureList(parsedList);

        expect(result).toEqual({
            bitrixId: 7,
            code: 'kpi',
            created: false,
            updated: false,
        });
        expect(add).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it('находит существующий список по легаси-коду `${group}_${type}`', async () => {
        getList.mockResolvedValue({
            result: [{ ID: '8', CODE: 'sales_kpi', NAME: 'ОП KPI' }],
        });

        const result = await service().ensureList(parsedList);

        expect(result.bitrixId).toBe(8);
        expect(result.code).toBe('sales_kpi');
        expect(add).not.toHaveBeenCalled();
    });

    it('обновляет NAME существующего списка при расхождении', async () => {
        getList.mockResolvedValue({
            result: [{ ID: '7', CODE: 'kpi', NAME: 'Старое имя' }],
        });

        const result = await service().ensureList(parsedList);

        expect(update).toHaveBeenCalledWith(
            { IBLOCK_ID: '7' },
            { NAME: 'ОП KPI' },
        );
        expect(result.updated).toBe(true);
    });

    it('создаёт список, если кандидаты кода не найдены', async () => {
        getList.mockResolvedValue({
            result: [{ ID: '9', CODE: 'other_list', NAME: 'Другой' }],
        });

        const result = await service().ensureList(parsedList);

        expect(add).toHaveBeenCalledWith('kpi', { NAME: 'ОП KPI', SORT: 1 });
        expect(result).toEqual({
            bitrixId: 41,
            code: 'kpi',
            created: true,
            updated: false,
        });
    });
});
