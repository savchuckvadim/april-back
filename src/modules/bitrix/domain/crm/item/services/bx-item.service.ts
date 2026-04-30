import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxItemRepository } from '../repository/bx-item.repository';
import { IBXItem } from '../interface/item.interface';
import { BitrixOwnerTypeId } from '../../../enums/bitrix-constants.enum';

export class BxItemService {
    private repo: BxItemRepository;

    clone(api: BitrixBaseApi): BxItemService {
        const instance = new BxItemService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxItemRepository(api);
    }

    async update(
        id: number | string,
        entityTypeId: BitrixOwnerTypeId.DEAL,
        data: Partial<IBXItem>,
    ) {
        return await this.repo.update(id, entityTypeId, data);
    }

    async list(
        entityTypeId: string,
        filter?: Partial<IBXItem>,
        select?: string[],
    ) {
        return await this.repo.list(entityTypeId, filter, select);
    }

    async get(id: number | string, entityTypeId: string, select?: string[]) {
        return await this.repo.get(id, entityTypeId, select);
    }

    async add(entityTypeId: string, data: Partial<IBXItem>) {
        return await this.repo.add(entityTypeId, data);
    }

    async delete(id: number | string, entityTypeId: string) {
        return await this.repo.delete(id, entityTypeId);
    }
}
