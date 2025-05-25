import { EBxMethod } from "src/modules/bitrix/core";
import { CrmGetRequestType, CrmAddRequestType, CrmUpdateRequestType, CrmListRequestType } from "../../type/crm-request.type";
import { IBXDeal } from "../interface/bx-deal.interface";
import { IBXField } from "../../fields/bx-field.interface";


export type DealSchema = {

    [EBxMethod.GET]: {
        request: CrmGetRequestType;
        response: IBXDeal;
    };
    [EBxMethod.LIST]: {
        request: CrmListRequestType<IBXDeal>;
        response: IBXDeal[];
    };
    [EBxMethod.ADD]: {
        request: CrmAddRequestType<IBXDeal>;
        response: number;
    };
    [EBxMethod.UPDATE]: {
        request: CrmUpdateRequestType<IBXDeal>;
        response: number;
    };
    [EBxMethod.CONTACT_ITEMS_SET]: {
        request: { id: number | string; items: { CONTACT_ID: string | number }[] };
        response: number;
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
