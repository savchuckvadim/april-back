import { BitrixBaseApi, EBXEntity, EBxMethod, EBxNamespace } from "@/modules/bitrix/core";

import { SmartTypeGetByEntityTypeIdRequestDto, SmartTypeGetRequestDto, SmartTypeListRequestDto } from "../dto/smart-type.dto";
import { SmartTypeAddRequestDto, SmartTypeUpdateRequestDto } from "../dto/smart-type-add.dto";

export class BxSmartTypeRepository {

    constructor(
        private readonly bxApi: BitrixBaseApi
    ) { }

    async getList(dto: SmartTypeListRequestDto) {

        const smarts = await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.TYPE,
            EBxMethod.LIST,
            dto
        );
        return smarts;
    }

    async get(dto: SmartTypeGetRequestDto) {
        const smart = await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.TYPE,
            EBxMethod.GET,
            dto
        );
        return smart;
    }

    async getByEntityTypeId(dto: SmartTypeGetByEntityTypeIdRequestDto) {
        const smart = await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.TYPE,
            EBxMethod.GET_BY_ENTITY_TYPE_ID,
            dto
        );
        return smart;
    }


    async add(dto: SmartTypeAddRequestDto) {
        const smart = await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.TYPE,
            EBxMethod.ADD,
            dto
        );
        return smart;
    }

    async update(dto: SmartTypeUpdateRequestDto) {
        const smart = await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.TYPE,
            EBxMethod.UPDATE,
            dto
        );
        return smart;
    }

    async delete(dto: SmartTypeGetRequestDto) {
        const smart = await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.TYPE,
            EBxMethod.DELETE,
            dto
        );
        return smart;
    }


}