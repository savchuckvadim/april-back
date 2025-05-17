import { EBxNamespace } from "../../core";
import { EBxMethod } from "../../core/domain/consts/bitrix-api.enum";
import { EBXEntity } from "../../core/domain/consts/bitrix-entities.enum";
import { BitrixBaseApi } from "../../core/base/bitrix-base-api";
import { ListFieldsGetRequestType, ListGetRequestType } from "./list.schema";


export class ListRepository {
    constructor(
        private readonly bitrixService: BitrixBaseApi
    ) { }

    async getList(IBLOCK_CODE?: 'sales_kpi' | 'sales_history' | 'presentation' | 'service_history') {

        const params = {
            'IBLOCK_TYPE_ID': 'lists',
            IBLOCK_CODE
        } as ListGetRequestType
        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.GET,
            params
        );
    }

    async getListField(
        code: 'sales_kpi' | 'kpi' | 'sales_history' | 'history' | 'presentation' | 'service_history',
        ID: string | number //913
    ) {
        const params = {
            IBLOCK_TYPE_ID: 'lists',
            IBLOCK_CODE: code,
            FIELD_ID: ID
        } as ListFieldsGetRequestType

        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_GET,
            params
        );
    }

    async getListFields(
        code: 'sales_kpi' | 'sales_history' | 'presentation' | 'service_history',

    ) {
        const params = {
            IBLOCK_TYPE_ID: 'lists',
            IBLOCK_CODE: code,

        } as ListFieldsGetRequestType

        return await this.bitrixService.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_GET,
            params
        );
    }
}

