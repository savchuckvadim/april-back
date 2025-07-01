import { EBxMethod } from "src/modules/bitrix/core";
import { IBXProductRow } from "../interface/bx-product-row.interface";
import { ListProductRowDto, ListProductRowResponseDto } from "../dto/list-product-row.sto";

export type ProductRowSchema = {

    [EBxMethod.SET]: {
        request: Partial<IBXProductRow>;
        response: IBXProductRow;
    };
    [EBxMethod.LIST]: {
        request: { filter: ListProductRowDto };
        response: ListProductRowResponseDto;
    };

};
