import { EBxNamespace } from '../../../core';
import { EBxMethod } from '../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../core/domain/consts/bitrix-entities.enum';
import { BitrixBaseApi } from '../../../core/base/bitrix-base-api';
import {
    ListAddRequestType,
    ListDeleteRequestType,
    ListFieldAddRequestType,
    ListFieldDeleteRequestType,
    ListFieldUpdateRequestType,
    ListFieldsGetRequestType,
    ListGetRequestType,
    ListUpdateRequestType,
} from '../schema/bx-list.schema';
import {
    BxListAddress,
    BxListAddressInput,
    IBXList,
    IBXListFieldPayload,
} from '../interface/bx-list.interface';

/** Строка трактуется как IBLOCK_CODE (обратная совместимость с EBxListCode) */
function toAddress(list: BxListAddressInput): BxListAddress {
    return typeof list === 'string' ? { IBLOCK_CODE: list } : list;
}

export class BxListRepository {
    constructor(private readonly bitrixService: BitrixBaseApi) {}

    async getList(list?: BxListAddressInput) {
        const params: ListGetRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            ...(list ? toAddress(list) : {}),
        };
        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.GET,
            params,
        );
    }

    getListBtch(cmdCode: string, list?: BxListAddressInput) {
        const params: ListGetRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            ...(list ? toAddress(list) : {}),
        };
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.GET,
            params,
        );
    }

    async add(IBLOCK_CODE: string, fields: Partial<IBXList>) {
        const params: ListAddRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            IBLOCK_CODE,
            FIELDS: fields,
        };
        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.ADD,
            params,
        );
    }

    async update(list: BxListAddressInput, fields: Partial<IBXList>) {
        const params: ListUpdateRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            ...toAddress(list),
            FIELDS: fields,
        };
        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.UPDATE,
            params,
        );
    }

    async delete(list: BxListAddressInput) {
        const params: ListDeleteRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            ...toAddress(list),
        };
        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.DELETE,
            params,
        );
    }

    async getListField(list: BxListAddressInput, ID: string | number) {
        const params: ListFieldsGetRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            ...toAddress(list),
            FIELD_ID: ID,
        };
        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_GET,
            params,
        );
    }

    getListFieldBtch(
        cmdCode: string,
        list: BxListAddressInput,
        ID: string | number,
    ) {
        const params: ListFieldsGetRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            ...toAddress(list),
            FIELD_ID: ID,
        };
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_GET,
            params,
        );
    }

    async getListFields(list: BxListAddressInput) {
        const params: ListFieldsGetRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            ...toAddress(list),
        };
        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_GET,
            params,
        );
    }

    getListFieldsBtch(cmdCode: string, list: BxListAddressInput) {
        const params: ListFieldsGetRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            ...toAddress(list),
        };
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_GET,
            params,
        );
    }

    async addField(list: BxListAddressInput, fields: IBXListFieldPayload) {
        const params: ListFieldAddRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            ...toAddress(list),
            FIELDS: fields,
        };
        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_ADD,
            params,
        );
    }

    addFieldBtch(
        cmdCode: string,
        list: BxListAddressInput,
        fields: IBXListFieldPayload,
    ) {
        const params: ListFieldAddRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            ...toAddress(list),
            FIELDS: fields,
        };
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_ADD,
            params,
        );
    }

    async updateField(
        list: BxListAddressInput,
        FIELD_ID: string | number,
        fields: IBXListFieldPayload,
    ) {
        const params: ListFieldUpdateRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            ...toAddress(list),
            FIELD_ID,
            FIELDS: fields,
        };
        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_UPDATE,
            params,
        );
    }

    updateFieldBtch(
        cmdCode: string,
        list: BxListAddressInput,
        FIELD_ID: string | number,
        fields: IBXListFieldPayload,
    ) {
        const params: ListFieldUpdateRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            ...toAddress(list),
            FIELD_ID,
            FIELDS: fields,
        };
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_UPDATE,
            params,
        );
    }

    async deleteField(list: BxListAddressInput, FIELD_ID: string | number) {
        const params: ListFieldDeleteRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            ...toAddress(list),
            FIELD_ID,
        };
        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_DELETE,
            params,
        );
    }

    deleteFieldBtch(
        cmdCode: string,
        list: BxListAddressInput,
        FIELD_ID: string | number,
    ) {
        const params: ListFieldDeleteRequestType = {
            IBLOCK_TYPE_ID: 'lists',
            ...toAddress(list),
            FIELD_ID,
        };
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_DELETE,
            params,
        );
    }
}
