import { EBxMethod } from "src/modules/bitrix/core";
import { CrmItemAddRequestType, CrmItemGetRequestType, CrmItemListRequestType, CrmUpdateItemRequestType } from "../../type/crm-request.type";

import { IBXItem } from "../interface/item.interface";


export type BxItemSchema = {


    [EBxMethod.UPDATE]: {
        request: CrmUpdateItemRequestType<IBXItem>;
        response: boolean;
    };

    [EBxMethod.LIST]: {
        request: CrmItemListRequestType<IBXItem['entityTypeId']>;
        response: { items: IBXItem[] };
    };

    [EBxMethod.GET]: {
        request: CrmItemGetRequestType<string | number>;
        response: { item: IBXItem };
    };

    [EBxMethod.ADD]: {
        request: CrmItemAddRequestType<IBXItem, string>;
        response: { item: IBXItem };
    };
};
