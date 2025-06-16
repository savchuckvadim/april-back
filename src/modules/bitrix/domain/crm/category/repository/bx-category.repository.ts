import { BitrixBaseApi } from "src/modules/bitrix/core";
import { EBxMethod, EBxNamespace, EBXEntity } from "src/modules/bitrix/";
import { BitrixOwnerTypeId } from "src/modules/bitrix/domain/enums/bitrix-constants.enum";


export class BxCategoryRepository {

    constructor(
        private readonly bxApi: BitrixBaseApi
    ) { }

    async get(id: number | string, entityTypeId: BitrixOwnerTypeId | string) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CATEGORY,
            EBxMethod.GET,
            { id, entityTypeId });
    }

    async getList(entityTypeId: BitrixOwnerTypeId | string) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CATEGORY,
            EBxMethod.LIST,
            { entityTypeId });
    }
}


