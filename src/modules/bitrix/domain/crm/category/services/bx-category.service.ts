import { BxCategoryRepository } from '../repository/bx-category.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXCategory } from '../interface/bx-category.interface';
import { BitrixOwnerTypeId } from 'src/modules/bitrix/domain/enums/bitrix-constants.enum';

export class BxCategoryService {
    private repo: BxCategoryRepository;

    clone(api: BitrixBaseApi): BxCategoryService {
        const instance = new BxCategoryService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxCategoryRepository(api);
    }

    async get(id: number | string, entityTypeId: BitrixOwnerTypeId | string) {
        return await this.repo.get(id, entityTypeId);
    }

    async getList(entityTypeId: BitrixOwnerTypeId | string) {
        return await this.repo.getList(entityTypeId);
    }

    async add(
        entityTypeId: BitrixOwnerTypeId | string,
        fields: Partial<Omit<IBXCategory, 'id' | 'entityTypeId'>>,
    ) {
        return await this.repo.add(entityTypeId, fields);
    }

    async update(
        id: number | string,
        entityTypeId: BitrixOwnerTypeId | string,
        fields: Partial<Omit<IBXCategory, 'id' | 'entityTypeId'>>,
    ) {
        return await this.repo.update(id, entityTypeId, fields);
    }

    async delete(
        id: number | string,
        entityTypeId: BitrixOwnerTypeId | string,
    ) {
        return await this.repo.delete(id, entityTypeId);
    }
}
