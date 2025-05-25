import { EBxMethod } from "src/modules/bitrix/core";
import { IBXProductRow } from "../interface/bx-product-row.interface";

export type ProductRowSchema = {

    [EBxMethod.SET]: {
        request: Partial<IBXProductRow>;
        response: IBXProductRow;
    };


};
