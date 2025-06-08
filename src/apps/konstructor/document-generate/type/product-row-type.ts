import { ComplectFullTitlesEnum, ComplectNumberType, ComplectsAndServicesFullTitlesType, ComplectsAndServicesTitlesType, ComplectsAndServicesTypeNamesEnum } from "./complect.type"
import { ContractNamesType, ContractNumberType, MeasureNamesType } from "./contract.type"
import { Product, ProductTypesEnum } from "./product.type"
import { QuantityForKpType, SupplyNameType, SupplyNumberType, SupplyType, SupplyTypesType } from "./supply.type"

export enum RowTargetTypesEnum {
    GENRAL = 'general',
    ALTERNATIVE = 'alternative'
}
export type RowsInSetType = {
    garant: Array<ProductRowType>
    lt: Array<ProductRowType>
    consalting: Array<ProductRowType>
    star: Array<ProductRowType>
}
export type RowSetType = {
    id: number
    rows: RowsInSetType,
    total: Array<ProductRowType> // тип массив чтобы привести все к одному типу для перебора, но set всегда один
    show: boolean
}

export enum ShowSetStatusEnum {
    ROWS = 'rows',
    SET = 'set'

}
export type ProductRowType = {

    id: number | false //from set   //only new version
    number: number   //from product
    setId: number | null
    name: ComplectsAndServicesFullTitlesType | ComplectFullTitlesEnum | string
    shortName: ComplectsAndServicesTitlesType | string
    defaultShortName: ComplectsAndServicesTitlesType | string
    defaultName: ComplectsAndServicesFullTitlesType | ComplectFullTitlesEnum | string
    alternativeName: string
    alternativeShortName: string
    type: RowTargetTypesEnum
    productType: ProductTypesEnum
    isTotal: boolean
    isUpdating: boolean
    supply: {
        name: SupplyNameType
        forkp: QuantityForKpType
        number: SupplyNumberType
        type: SupplyTypesType
        alternativeName: string,
        defaultName: SupplyNameType
    }
    contract: {
        name: ContractNamesType
        number: ContractNumberType
    }
    complect: {
        type: ComplectsAndServicesTypeNamesEnum
        number: ComplectNumberType
    }
    product : Product,
    currentSupply: SupplyType

    price: ProductRowPriceType

}

export type RowPropType =  'isTotal' | 'isUpdating' 

export type ProductRowPriceType = {
    default: number // цена в исхлдной единице измерения 1 абон полгода / 1 месяц
    current: number
    quantity: number
    month: number //цена всех продуктов в пересчете на месяц
    sum: number
    year: number

    measure: {
        id: number
        code: number,
        type: MeasureTypes
        name: MeasureNamesType
        contractNumber: number
    }
   
    discount: {
        precent: number
        amount: number
        current: DiscountEnum
    }   

}
export type StateSetsType = {
    [key: string]: Array<RowSetType>
}
export enum DiscountEnum {
    PRECENT = 'precent',
    AMOUNT = 'amount'
}

export type MeasureTypes = 1 | 6 | 12 | 24  //'month' | 'half' | 'year' | 'twoYears' 

export enum RowItemsEnum {
    DEFAULT = 'default', //для изменения налогов
    PRICE = 'price',
    QUANTITY = 'quantity',
    DISCOUNT = 'discount',
    DISCOUNT_AMOUNT = 'discountAmount',
    MEASURE = 'measure',
    ONMONTH = 'onmonth',
    SUM = 'sum',

}



export type NoserviceSelectItemType = {
    number: 0
    name: 'не выбирать'
    description: string
    fullName: 'не выбирать'
    msk: number
    regions: number
    type: 'cancel'

}