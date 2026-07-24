import { AxiosInstance } from 'axios';
import { BatchApiService } from '../batch-api.service';
import { BitrixCore } from '../bitrix-core.service';

/** Сабкласс, открывающий protected-метод сериализации для теста. */
class TestableBatchApiService extends BatchApiService {
    buildQueryString(method: string, data: Record<string, unknown>): string {
        return this.dictToQueryString(method, data);
    }
}

describe('BatchApiService.dictToQueryString', () => {
    const service = new TestableBatchApiService(
        {} as unknown as BitrixCore,
        {} as unknown as AxiosInstance,
    );

    it("экранирует '=' в ключе фильтра ('=ownerId' → '%3DownerId')", () => {
        const query = service.buildQueryString('crm.item.productrow.list', {
            filter: { '=ownerType': 'D', '=ownerId': 123 },
        });
        expect(query).toBe(
            'crm.item.productrow.list?filter[%3DownerType]=D&filter[%3DownerId]=123',
        );
    });

    it('не меняет обычные ключи и префиксы сравнения в ключах без =', () => {
        const query = service.buildQueryString('crm.deal.list', {
            filter: { CATEGORY_ID: 1, '>price': 5 },
        });
        expect(query).toBe(
            'crm.deal.list?filter[CATEGORY_ID]=1&filter[>price]=5',
        );
    });

    it('массивы сериализуются как key[]= с экранированным ключом', () => {
        const query = service.buildQueryString('crm.deal.list', {
            filter: { '=STAGE_ID': ['C1:WON', 'C1:LOSE'] },
        });
        expect(query).toBe(
            'crm.deal.list?filter[%3DSTAGE_ID][]=C1:WON&filter[%3DSTAGE_ID][]=C1:LOSE',
        );
    });
});
