import { EBXEntity, EBxMethod } from "src/modules/bitrix/core";
import { IBXDeal } from "../../interfaces/bitrix.interface";
import { CrmGetRequestType, CrmAddRequestType, CrmUpdateRequestType, CrmListRequestType } from "../type/crm-request.type";



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

};
