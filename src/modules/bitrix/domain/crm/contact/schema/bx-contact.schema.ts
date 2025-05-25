import { EBxMethod } from "../../../../core";
import { IBXField } from "../../fields/bx-field.interface";
import { CrmGetRequestType, CrmAddRequestType, CrmUpdateRequestType, CrmListRequestType } from "../../type/crm-request.type";
import { IBXContact } from "../interface/bx-contact.interface";



export type ContactSchema = {
    [EBxMethod.GET]: {
        request: CrmGetRequestType; // Contains ID and select?
        response: IBXContact;
    };
    [EBxMethod.LIST]: {
        request: CrmListRequestType<IBXContact>;
        response: IBXContact[];
    };
    [EBxMethod.ADD]: {
        request: CrmAddRequestType<IBXContact>;
        response: number; // ID of created contact
    };
    [EBxMethod.UPDATE]: {
        request: CrmUpdateRequestType<IBXContact>; // Contains id (lowercase) and fields
        response: number; // Bitrix often returns a boolean success as number or specific status
    };
    [EBxMethod.USER_FIELD_LIST]: {
        request: { filter: { [key: string]: any }, select?: string[] };
        response: IBXField[];
    };
    [EBxMethod.USER_FIELD_GET]: {
        request: { id: number | string, select?: string[] };
        response: IBXField;
    };
}; 