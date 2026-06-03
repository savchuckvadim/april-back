import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXChecklistItemAddRequest,
    IBXChecklistItemCompleteRequest,
    IBXChecklistItemDeleteRequest,
    IBXChecklistItemGetRequest,
    IBXChecklistItemUpdateRequest,
} from '../interface/bx-checklist-item.interface';
import { BxChecklistItemRepository } from '../repository/bx-checklist-item.repository';

export class BxChecklistItemService {
    private repo: BxChecklistItemRepository;

    clone(api: BitrixBaseApi): BxChecklistItemService {
        const instance = new BxChecklistItemService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxChecklistItemRepository(api);
    }

    async add(data: IBXChecklistItemAddRequest) {
        return await this.repo.add(data);
    }

    async get(data: IBXChecklistItemGetRequest) {
        return await this.repo.get(data);
    }

    async update(data: IBXChecklistItemUpdateRequest) {
        return await this.repo.update(data);
    }

    async delete(data: IBXChecklistItemDeleteRequest) {
        return await this.repo.delete(data);
    }

    async complete(data: IBXChecklistItemCompleteRequest) {
        return await this.repo.complete(data);
    }
}
