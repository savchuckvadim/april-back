import { Injectable } from '@nestjs/common';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXChecklistItemAddRequest,
    IBXChecklistItemCompleteRequest,
    IBXChecklistItemDeleteRequest,
    IBXChecklistItemGetRequest,
    IBXChecklistItemUpdateRequest,
} from '../interface/bx-checklist-item.interface';
import { BxChecklistItemRepository } from '../repository/bx-checklist-item.repository';

@Injectable()
export class BxChecklistItemBatchService {
    private repo: BxChecklistItemRepository;

    clone(api: BitrixBaseApi): BxChecklistItemBatchService {
        const instance = new BxChecklistItemBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxChecklistItemRepository(api);
    }

    add(cmdCode: string, data: IBXChecklistItemAddRequest) {
        return this.repo.addBtch(cmdCode, data);
    }

    get(cmdCode: string, data: IBXChecklistItemGetRequest) {
        return this.repo.getBtch(cmdCode, data);
    }

    update(cmdCode: string, data: IBXChecklistItemUpdateRequest) {
        return this.repo.updateBtch(cmdCode, data);
    }

    delete(cmdCode: string, data: IBXChecklistItemDeleteRequest) {
        return this.repo.deleteBtch(cmdCode, data);
    }

    complete(cmdCode: string, data: IBXChecklistItemCompleteRequest) {
        return this.repo.completeBtch(cmdCode, data);
    }
}
