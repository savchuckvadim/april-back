import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { EBxMethod, EBxNamespace } from "../../../core/domain/consts/bitrix-api.enum";
import { EBXEntity } from "../../../core/domain/consts/bitrix-entities.enum";



export class BxFieldRepository {
    constructor(private readonly bitrixService: BitrixBaseApi) { }

    async getUserFields() {
        return this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.USER_FIELD,
            EBxMethod.FIELDS,
            undefined
        );
    }
    async getUserFieldsEnumeration() {
        return this.bitrixService.callType(
            EBxNamespace.CRM,
            EBXEntity.USER_FIELD_ENUMERATION,
            EBxMethod.FIELDS,
            undefined
        );
    }
}
