export enum DocumentFieldDescriptionMode {
    NO = 'no',
    SMALL = 'small',
    MEDIUM = 'medium',
    BIG = 'big'
}

export enum DocumentFieldViewMode {
    LIST = 'list',
    TABLE = 'table',
    TABLE_WITH_GROUP = 'tableWithGroup'
}
export enum DocumentFieldDescriptionNames {
    NO = 'Нет',
    SMALL = 'Мало',
    MEDIUM = 'Средне',
    BIG = 'Много'
}
export enum DocumentFieldBooleanSelect {
    NO = 'no',
    YES = 'yes',

}
export enum DocumentFieldBooleanSelectNames {
    NO = 'Нет',
    YES = 'Да',

}
export enum DocumentFieldViewNames {
    LIST = 'Список',
    TABLE = 'Таблица',
    TABLE_WITH_GROUP = 'Таблица с разделами'
}

export enum DocumentInfoblocksItems {
    STYLE = 'style',
    DESCRIPTION = 'description',
    WITH_STAMP = 'withStamps',
    WITH_MANAGER = 'withManager',
    IS_PRICE_FIRST = 'isPriceFirst'
    // SALE_PHRASE = 'salePhrase'
}
export enum DocumentInfoblocksItemsNames {
    STYLE = 'Стиль инфоблоков',
    DESCRIPTION = 'Количество описания наполнения',
    WITH_STAMP = 'С подписями и печатями',
    WITH_MANAGER = 'Контакты менеджера',
    IS_PRICE_FIRST = 'Сначала цена, потом инфоблоки',
}

export type DocumentInfoblocksOptionItem = {
    id: number
    value: DocumentFieldViewNames | DocumentFieldDescriptionNames
    code: DocumentFieldViewMode | DocumentFieldDescriptionMode
}

export type DocumentInfoblocksOptionSelectItem = {
    id: number
    value: DocumentFieldBooleanSelectNames
    code: DocumentFieldBooleanSelect
}


export type DocumentInfoblocksOption = {
    name: DocumentInfoblocksItemsNames
    isRemembed: boolean
    type: DocumentInfoblocksItems
    items: Array<DocumentInfoblocksOptionItem>
    current: DocumentInfoblocksOptionItem
}

export type DocumentInfoblocksOptionSelect = {
    name: DocumentInfoblocksItemsNames
    isRemembed: boolean
    type: DocumentInfoblocksItems
    items: Array<DocumentInfoblocksOptionSelectItem>
    current: DocumentInfoblocksOptionSelectItem
}


// export type DocumentInfoblocksItemsState = {
//     [DocumentInfoblocksItems.STYLE]: DocumentInfoblocksOption
//     [DocumentInfoblocksItems.DESCRIPTION]: DocumentInfoblocksOption
//     [DocumentInfoblocksItems.WITH_STAMP]: DocumentInfoblocksOption
//     [DocumentInfoblocksItems.WITH_MANAGER]: DocumentInfoblocksOption
//     [DocumentInfoblocksItems.IS_PRICE_FIRST]: DocumentInfoblocksOption
//     // [DocumentInfoblocksItems.SALE_PHRASE]: InfoblockSalePhraseOption
// }

export interface OfferSettings  {
    [SETTING_ITEM.STYLE]: {
        name: DocumentInfoblocksItemsNames
        isRemembed: boolean
        isChanged: boolean
        items: Array<DocumentInfoblocksOptionItem>
        current: DocumentInfoblocksOptionItem
        type: DocumentInfoblocksItems.STYLE
        // previous: null | DocumentInfoblocksOptionItem
    },
    [SETTING_ITEM.DESCRIPTION]: {
        name: DocumentInfoblocksItemsNames
        isRemembed: boolean
        isChanged: boolean
        items: Array<DocumentInfoblocksOptionItem>
        current: DocumentInfoblocksOptionItem
        type: DocumentInfoblocksItems.DESCRIPTION
        // previous: null | DocumentInfoblocksOptionItem
    },
    [SETTING_ITEM.SALE_PHRASE]: {
        isRemembed: boolean
        isChanged: boolean
        value: string | null
        // error: boolean
        // previous: null

    },
    [SETTING_ITEM.WITH_STAMP]: {
        name: DocumentInfoblocksItemsNames
        isRemembed: boolean
        isChanged: boolean
        items: Array<DocumentInfoblocksOptionSelectItem>
        current: DocumentInfoblocksOptionSelectItem
        type: DocumentInfoblocksItems.WITH_STAMP
        // previous: null | DocumentInfoblocksOptionSelectItem

    },
    [SETTING_ITEM.WITH_MANAGER]: {
        name: DocumentInfoblocksItemsNames
        isRemembed: boolean
        isChanged: boolean
        items: Array<DocumentInfoblocksOptionSelectItem>
        current: DocumentInfoblocksOptionSelectItem
        type: DocumentInfoblocksItems.WITH_MANAGER
        // previous: null | DocumentInfoblocksOptionSelectItem
        // error: boolean

    },
    [SETTING_ITEM.IS_PRICE_FIRST]: {
        name: DocumentInfoblocksItemsNames
        isRemembed: boolean
        isChanged: boolean
        items: Array<DocumentInfoblocksOptionSelectItem>
        current: DocumentInfoblocksOptionSelectItem
        type: DocumentInfoblocksItems.IS_PRICE_FIRST
        // previous: null | DocumentInfoblocksOptionSelectItem
        // error: boolean

    },
    // settings: {
    //     status: boolean
    // }
}

export enum SETTING_ITEM {
    STYLE = 'style',
    DESCRIPTION = 'description',
    SALE_PHRASE = 'salePhrase',
    WITH_STAMP = 'withStamps',
    WITH_MANAGER = 'withManager',
    IS_PRICE_FIRST = 'isPriceFirst'
}