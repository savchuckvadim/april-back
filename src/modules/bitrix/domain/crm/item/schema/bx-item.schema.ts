import { EBxMethod } from "src/modules/bitrix/core";
import { CrmUpdateItemRequestType } from "../../type/crm-request.type";

import { IBXItem } from "../interface/item.interface";


export type BxItemSchema = {


    [EBxMethod.UPDATE]: {
        request: CrmUpdateItemRequestType<IBXItem>;
        response: boolean;
    };


};
