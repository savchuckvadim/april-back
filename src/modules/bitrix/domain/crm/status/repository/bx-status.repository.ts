import { BitrixBaseApi } from "src/modules/bitrix/core";
import { EBxMethod, EBxNamespace, EBXEntity } from "src/modules/bitrix/";
import { IBXStatus } from "../interface/bx-status.interface";


export class BxStatusRepository {

    constructor(
        private readonly bxApi: BitrixBaseApi
    ) { }

    async getList(filter: Partial<IBXStatus>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.STATUS,
            EBxMethod.LIST,
            { filter }
        );
    }
}


