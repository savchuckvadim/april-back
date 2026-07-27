import { BitrixService } from '@/modules/bitrix';
import { IFieldItem } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { SalesFinanceCacheService } from '../cache/sales-finance-cache.service';
import {
    ContractTypeItemsService,
    mergeContractTypeItems,
} from '../domain/services/contract-type-items.service';

const DOMAIN = 'april.bitrix24.ru';
const UF_KEY = 'UF_CRM_CONTRACT_TYPE';

function makeMocks(cached: unknown = null) {
    const getFieldsList = jest.fn().mockResolvedValue({
        result: [
            {
                FIELD_NAME: UF_KEY,
                LIST: [
                    { ID: '301', VALUE: 'Гарант Стандарт', XML_ID: 'garant_standart' },
                    // элемент, добавленный на портале руками — без XML_ID
                    { ID: '407', VALUE: 'Интернет-версия', XML_ID: '' },
                ],
            },
        ],
    });
    const bitrix = {
        deal: { getFieldsList },
    } as unknown as BitrixService;
    const cache = {
        getJson: jest.fn().mockResolvedValue(cached),
        setJson: jest.fn().mockResolvedValue(undefined),
    } as unknown as SalesFinanceCacheService & {
        getJson: jest.Mock;
        setJson: jest.Mock;
    };
    return { bitrix, cache, getFieldsList };
}

describe('ContractTypeItemsService', () => {
    it('живой список: XML_ID → code, без XML_ID → bx_<ID>, name = VALUE', async () => {
        const { bitrix, cache } = makeMocks();
        const items = await new ContractTypeItemsService(
            bitrix,
            cache,
            DOMAIN,
        ).getItems(UF_KEY);

        expect(items).toEqual([
            { id: 301, code: 'garant_standart', name: 'Гарант Стандарт' },
            { id: 407, code: 'bx_407', name: 'Интернет-версия' },
        ]);
        expect(cache.setJson).toHaveBeenCalled(); // словарь закэширован
    });

    it('кэш-хит: Bitrix не вызывается', async () => {
        const cachedItems = [{ id: 1, code: 'x', name: 'X' }];
        const { bitrix, cache, getFieldsList } = makeMocks(cachedItems);
        const items = await new ContractTypeItemsService(
            bitrix,
            cache,
            DOMAIN,
        ).getItems(UF_KEY);

        expect(items).toEqual(cachedItems);
        expect(getFieldsList).not.toHaveBeenCalled();
    });

    it('forceRefresh обходит кэш', async () => {
        const { bitrix, cache, getFieldsList } = makeMocks([{ id: 1 }]);
        await new ContractTypeItemsService(bitrix, cache, DOMAIN).getItems(
            UF_KEY,
            true,
        );
        expect(cache.getJson).not.toHaveBeenCalled();
        expect(getFieldsList).toHaveBeenCalled();
    });

    it('поле не настроено (пустой ufKey) → пустой список без запросов', async () => {
        const { bitrix, cache, getFieldsList } = makeMocks();
        const items = await new ContractTypeItemsService(
            bitrix,
            cache,
            DOMAIN,
        ).getItems('');
        expect(items).toEqual([]);
        expect(getFieldsList).not.toHaveBeenCalled();
        expect(cache.getJson).not.toHaveBeenCalled();
    });
});

describe('mergeContractTypeItems', () => {
    const portalItem = (
        code: string,
        bitrixId: number,
        name: string,
    ): IFieldItem => ({ code, bitrixId, name }) as unknown as IFieldItem;

    it('портальный code первичен, имя — из живого списка', () => {
        const merged = mergeContractTypeItems(
            [portalItem('internet', 5440, 'Интернет')],
            [{ id: 5440, code: 'bx_5440', name: 'Интернет-Версия' }],
        );
        expect(merged).toEqual([
            { id: 5440, code: 'internet', name: 'Интернет-Версия' },
        ]);
    });

    it('живые элементы вне портальной БД (ручные) добавляются в хвост', () => {
        const merged = mergeContractTypeItems(
            [portalItem('lic', 5444, 'Лицензионный')],
            [
                { id: 5444, code: 'bx_5444', name: 'Лицензионный' },
                { id: 9001, code: 'bx_9001', name: 'Ручной тип' },
            ],
        );
        expect(merged).toEqual([
            { id: 5444, code: 'lic', name: 'Лицензионный' },
            { id: 9001, code: 'bx_9001', name: 'Ручной тип' },
        ]);
    });

    it('портальный элемент без живой пары сохраняется с портальным именем', () => {
        const merged = mergeContractTypeItems(
            [portalItem('abon', 5442, 'Абонентский')],
            [],
        );
        expect(merged).toEqual([
            { id: 5442, code: 'abon', name: 'Абонентский' },
        ]);
    });
});
