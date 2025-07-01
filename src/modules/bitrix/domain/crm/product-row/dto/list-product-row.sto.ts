import { BitrixOwnerType } from "../../../enums/bitrix-constants.enum"
import { IBXProductRowRow } from "../interface/bx-product-row.interface"

export class ListProductRowDto {
    "=ownerType": BitrixOwnerType | string
    "=ownerId": string | number
}   

export class ListProductRowResponseDto {
    productRows: IBXProductRowRow[]
}   