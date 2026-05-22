import { BxCategoryRepository } from '../repository/bx-category.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXCategory } from '../interface/bx-category.interface';
import { BitrixOwnerTypeId } from 'src/modules/bitrix/domain/enums/bitrix-constants.enum';

export class BxCategoryBatchService {
    private repo: BxCategoryRepository;

    clone(api: BitrixBaseApi): BxCategoryBatchService {
        const instance = new BxCategoryBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxCategoryRepository(api);
    }

    get(
        cmdCode: string,
        id: number | string,
        entityTypeId: BitrixOwnerTypeId | string,
    ) {
        return this.repo.getBtch(cmdCode, id, entityTypeId);
    }

    getList(cmdCode: string, entityTypeId: BitrixOwnerTypeId | string) {
        return this.repo.getListBtch(cmdCode, entityTypeId);
    }

    add(
        cmdCode: string,
        entityTypeId: BitrixOwnerTypeId | string,
        fields: Partial<Omit<IBXCategory, 'id' | 'entityTypeId'>>,
    ) {
        return this.repo.addBtch(cmdCode, entityTypeId, fields);
    }

    update(
        cmdCode: string,
        id: number | string,
        entityTypeId: BitrixOwnerTypeId | string,
        fields: Partial<Omit<IBXCategory, 'id' | 'entityTypeId'>>,
    ) {
        return this.repo.updateBtch(cmdCode, id, entityTypeId, fields);
    }

    delete(
        cmdCode: string,
        id: number | string,
        entityTypeId: BitrixOwnerTypeId | string,
    ) {
        return this.repo.deleteBtch(cmdCode, id, entityTypeId);
    }
}
