import { Injectable } from '@nestjs/common';
import { BxListRepository } from '../repository/bx-list.repository';
import { BitrixBaseApi } from '../../../core/base/bitrix-base-api';
import {
    BxListAddressInput,
    IBXList,
    IBXListFieldPayload,
} from '../interface/bx-list.interface';

@Injectable()
export class BxListService {
    private repo: BxListRepository;

    clone(api: BitrixBaseApi): BxListService {
        const instance = new BxListService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxListRepository(api);
    }

    getList(list?: BxListAddressInput) {
        return this.repo.getList(list);
    }

    add(IBLOCK_CODE: string, fields: Partial<IBXList>) {
        return this.repo.add(IBLOCK_CODE, fields);
    }

    update(list: BxListAddressInput, fields: Partial<IBXList>) {
        return this.repo.update(list, fields);
    }

    delete(list: BxListAddressInput) {
        return this.repo.delete(list);
    }

    getListField(list: BxListAddressInput, ID: string | number) {
        return this.repo.getListField(list, ID);
    }

    getListFields(list: BxListAddressInput) {
        return this.repo.getListFields(list);
    }

    addField(list: BxListAddressInput, fields: IBXListFieldPayload) {
        return this.repo.addField(list, fields);
    }

    updateField(
        list: BxListAddressInput,
        FIELD_ID: string | number,
        fields: IBXListFieldPayload,
    ) {
        return this.repo.updateField(list, FIELD_ID, fields);
    }

    deleteField(list: BxListAddressInput, FIELD_ID: string | number) {
        return this.repo.deleteField(list, FIELD_ID);
    }
}
