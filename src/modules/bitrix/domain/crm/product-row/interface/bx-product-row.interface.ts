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