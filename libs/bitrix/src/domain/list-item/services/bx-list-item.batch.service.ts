import { BitrixBaseApi } from '@/modules/bitrix';
import { BxListItemRepository } from '../repositories/bx-list-item.repository';
import { BxListItemAddRequestType } from '../schema/bx-list-item.schema';

export class BxListItemBatchService {
    private repo: BxListItemRepository;

    clone(api: BitrixBaseApi): BxListItemBatchService {
        const instance = new BxListItemBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxListItemRepository(api);
    }

    add(
        cmdCode: string,
        dto: Omit<BxListItemAddRequestType, 'IBLOCK_TYPE_ID'>,
    ) {
        return this.repo.addBtch(cmdCode, dto);
    }
}
