import { EBxMethod } from 'src/modules/bitrix/core';
import { IBXProductRow, IBXProductRowRow } from '../interface/bx-product-row.interface';
import {
    ListProductRowDto,
    ListProductRowResponseDto,
} from '../dto/list-product-row.sto';

export type ProductRowSchema = {
    [EBxMethod.SET]: {
        request: Partial<IBXProductRow>;
        response: IBXProductRow;
    };
    [EBxMethod.ADD]: {
        request: { fields: Partial<IBXProductRowRow> };
        response: { productRow: IBXProductRowRow };
    };
    [EBxMethod.LIST]: {
        request: { filter: ListProductRowDto };
        response: ListProductRowResponseDto;
    };
};
