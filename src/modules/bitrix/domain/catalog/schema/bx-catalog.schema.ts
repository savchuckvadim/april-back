import { EBxMethod } from "src/modules/bitrix/core";
import { IBXProduct } from "../interface/bx-product.interface";
import { CrmListRequestType } from "../../crm/type/crm-request.type";

export type BxCatalogSchema = {
    [EBxMethod.GET]: {
        request: {
            id: number | string;
            select?: Partial<IBXProduct>;
        };
        response: {product: IBXProduct};
    };
    [EBxMethod.LIST]: {
        request:  {
            filter: Partial<IBXProduct>;
            select: (keyof IBXProduct)[];
        };
        response: {products: IBXProduct[]};
    };
}