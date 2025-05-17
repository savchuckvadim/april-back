import { EBxMethod } from "../../../core/domain/consts/bitrix-api.enum";
import { IBXCompany } from "../../interfaces/bitrix.interface";
import { CrmGetRequestType, CrmAddRequestType, CrmUpdateRequestType, CrmListRequestType } from "../type/crm-request.type";

export type CompanySchema = {
    [EBxMethod.GET]: {
        request: CrmGetRequestType; // Contains ID and select?
        response: IBXCompany;
    };
    [EBxMethod.LIST]: {
        request: CrmListRequestType<IBXCompany>;
        response: IBXCompany[];
    };
    [EBxMethod.ADD]: {
        request: CrmAddRequestType<IBXCompany>;
        response: number; // ID of created company
    };
    [EBxMethod.UPDATE]: {
        request: CrmUpdateRequestType<IBXCompany>; // Contains id (lowercase) and fields
        response: number; // Bitrix often returns a boolean success as number or specific status, matching DealSchema
    };
}; 