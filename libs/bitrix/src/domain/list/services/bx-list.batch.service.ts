import { Injectable } from '@nestjs/common';
import { BxListRepository } from '../repository/bx-list.repository';
import { BitrixBaseApi } from '../../../core/base/bitrix-base-api';
import {
    BxListAddressInput,
    IBXListFieldPayload,
} from '../interface/bx-list.interface';

@Injectable()
export class BxListBatchService {
    clone(api: BitrixBaseApi): BxListBatchService {
        const instance = new BxListBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxListRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxListRepository(api);
    }

    getList(cmdCode: string, list?: BxListAddressInput) {
        return this.repo.getListBtch(cmdCode, list);
    }

    getListField(
        cmdCode: string,
        list: BxListAddressInput,
        ID: string | number,
    ) {
        return this.repo.getListFieldBtch(cmdCode, list, ID);
    }

    getListFields(cmdCode: string, list: BxListAddressInput) {
        return this.repo.getListFieldsBtch(cmdCode, list);
    }

    addField(
        cmdCode: string,
        list: BxListAddressInput,
        fields: IBXListFieldPayload,
    ) {
        return this.repo.addFieldBtch(cmdCode, list, fields);
    }

    updateField(
        cmdCode: string,
        list: BxListAddressInput,
        FIELD_ID: string | number,
        fields: IBXListFieldPayload,
    ) {
        return this.repo.updateFieldBtch(cmdCode, list, FIELD_ID, fields);
    }

    deleteField(
        cmdCode: string,
        list: BxListAddressInput,
        FIELD_ID: string | number,
    ) {
        return this.repo.deleteFieldBtch(cmdCode, list, FIELD_ID);
    }
}
