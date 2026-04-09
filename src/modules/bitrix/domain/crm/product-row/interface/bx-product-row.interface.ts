// export interface IBXProductRow {
//     id?: number;
//     price: number;
//     quantity: number;
//     productName: string;
//     measureId: number;
// }

import { BitrixOwnerType } from '../../../enums/bitrix-constants.enum';

export interface IBXProductRow {
    ownerType: BitrixOwnerType | string;
    ownerId: string | number;
    productRows: IBXProductRowRow[];
}

export interface IBXProductRowRow {
    id?: number;
    // ownerId?: number | string
    // ownerTypeId?: string | BitrixOwnerType
    priceNetto?: number;
    price?: number;
    discountSum?: number;
    discountTypeId?: number;

    productName?: string;
    quantity?: number;
    customized?: string;
    supply?: string;
    measureCode?: string;
    measureId?: number | string;

    measureName?: string;
    sort?: number;
}

export interface IBXDealProductRowGet {
    ID?: number;
    OWNER_ID: number;
    OWNER_TYPE: string;
    PRODUCT_ID: number;
    PRODUCT_NAME: string;
    ORIGINAL_PRODUCT_NAME: string | null;
    PRODUCT_DESCRIPTION: string | null;
    PRICE: number;
    PRICE_EXCLUSIVE: number;
    PRICE_NETTO: number;
    PRICE_BRUTTO: number;
    PRICE_ACCOUNT: number;
    QUANTITY: number;
    DISCOUNT_TYPE_ID: number;
    DISCOUNT_RATE: number;
    DISCOUNT_SUM: number;
    TAX_RATE: number | string | null;
    TAX_INCLUDED: string;
    CUSTOMIZED: string;
    MEASURE_CODE: number;
    MEASURE_NAME: string;
    SORT: number;
    XML_ID: string | null;
    TYPE: number;
    STORE_ID: number | null;
    RESERVE_ID: number | null;
    DATE_RESERVE_END: string | null;
    RESERVE_QUANTITY: number | string | null;
}
