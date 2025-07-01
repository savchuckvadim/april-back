// export interface IBXProductRow {
//     id?: number;
//     price: number;
//     quantity: number;
//     productName: string;
//     measureId: number;
// }

import { BitrixOwnerType } from "../../../enums/bitrix-constants.enum"



export interface IBXProductRow {
    ownerType: BitrixOwnerType,
    ownerId: string | number,
    productRows: IBXProductRowRow[]

}

export interface IBXProductRowRow {
    id?: number
    // ownerId?: number | string 
    // ownerTypeId?: string | BitrixOwnerType
    priceNetto?: number
    price?: number
    discountSum?: number
    discountTypeId?: number

    productName?: string
    quantity?: number
    customized?: string
    supply?: string
    measureCode?: string
    measureId?: number | string
    sort?: number


}

export interface IBXDealProductRowGet {
    ID?: number
    OWNER_ID: number
    OWNER_TYPE: string
    PRODUCT_ID: number
    PRODUCT_NAME: string
    ORIGINAL_PRODUCT_NAME: string | null
    PRODUCT_DESCRIPTION: string | null
    PRICE: number | number
    PRICE_EXCLUSIVE: number | number
    PRICE_NETTO: number | number
    PRICE_BRUTTO: number | number
    PRICE_ACCOUNT: number | number
    QUANTITY: number
    DISCOUNT_TYPE_ID: number | number
    DISCOUNT_RATE: number | number
    DISCOUNT_SUM: number | number
    TAX_RATE: number | string | null
    TAX_INCLUDED: string
    CUSTOMIZED: string
    MEASURE_CODE: number
    MEASURE_NAME: string
    SORT: number
    XML_ID: string | null
    TYPE: number
    STORE_ID: number | null
    RESERVE_ID: number | null
    DATE_RESERVE_END: string | null
    RESERVE_QUANTITY: number | string | null
}