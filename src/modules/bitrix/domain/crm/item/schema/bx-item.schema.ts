import { EBxMethod } from "src/modules/bitrix/core";
import { CrmItemAddRequestType, CrmItemGetRequestType, CrmItemListRequestType, CrmUpdateItemRequestType } from "../../type/crm-request.type";

import { IBXItem } from "../interface/item.interface";


export type BxItemSchema = {


    [EBxMethod.UPDATE]: {
        request: CrmUpdateItemRequestType<IBXItem>;
        response: boolean;
    };

    [EBxMethod.LIST]: {
        request: CrmItemListRequestType<string>;
        response: IBXItem[];
    };

    [EBxMethod.GET]: {
        request: CrmItemGetRequestType<string>;
        response: IBXItem;
    };

    [EBxMethod.ADD]: {
        request: CrmItemAddRequestType<IBXItem, string>;
        response: IBXItem;
    };
};
