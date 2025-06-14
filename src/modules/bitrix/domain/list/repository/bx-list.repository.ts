import { EBxNamespace } from "../../../core";
import { EBxMethod } from "../../../core/domain/consts/bitrix-api.enum";
import { EBXEntity } from "../../../core/domain/consts/bitrix-entities.enum";
import { BitrixBaseApi } from "../../../core/base/bitrix-base-api";
import { ListFieldsGetRequestType, ListGetRequestType } from "../schema/bx-list.schema";
import { EBxListCode } from "../interface/bx-list.interface";


export class BxListRepository {
    constructor(
        private readonly bitrixService: BitrixBaseApi
    ) { }

    async getList(IBLOCK_CODE?: EBxListCode) {
        const params = {
            IBLOCK_TYPE_ID: 'lists',
            IBLOCK_CODE
        } as ListGetRequestType;
        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.GET,
            params
        );
    }

    getListBtch(cmdCode: string, IBLOCK_CODE?: EBxListCode) {
        const params = {
            'IBLOCK_TYPE_ID': 'lists',
            IBLOCK_CODE
        } as ListGetRequestType;
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.GET,
            params
        );
    }

    async getListField(
        code: EBxListCode,
        ID: string | number
    ) {
        const params = {
            IBLOCK_TYPE_ID: 'lists',
            IBLOCK_CODE: code,
            FIELD_ID: ID
        } as ListFieldsGetRequestType;

        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_GET,
            params
        );
    }

    getListFieldBtch(
        cmdCode: string,
        code: EBxListCode,
        ID: string | number
    ) {
        const params = {
            IBLOCK_TYPE_ID: 'lists',
            IBLOCK_CODE: code,
            FIELD_ID: ID
        } as ListFieldsGetRequestType;

        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_GET,
            params
        );
    }

    async getListFields(
        code: EBxListCode
    ) {
        const params = {
            IBLOCK_TYPE_ID: 'lists',
            IBLOCK_CODE: code
        } as ListFieldsGetRequestType;

        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_GET,
            params
        );
    }

    getListFieldsBtch(
        cmdCode: string,
        code: EBxListCode
    ) {
        const params = {
            IBLOCK_TYPE_ID: 'lists',
            IBLOCK_CODE: code
        } as ListFieldsGetRequestType;

        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_GET,
            params
        );
    }
}

