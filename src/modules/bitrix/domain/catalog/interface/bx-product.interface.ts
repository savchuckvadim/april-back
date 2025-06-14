export interface IBXProduct {
    active: "Y" | "N",
    available: "Y" | "N",
    bundle: "Y" | "N",
    canBuyZero: "Y" | "N",
    code: string,
    createdBy: number,
    dateActiveFrom: string,
    dateActiveTo: string,
    dateCreate: string,
    // detailPicture: {
    //     id: string,
    //     url: string,
    //     urlMachine: string
    // },
    detailText: string | null,
    detailTextType: string,
    height: number,
    iblockId: number,
    iblockSectionId: number,
    id: number | string,
    length: number,
    measure: number,
    modifiedBy: number,
    name: string,
    // previewPicture: {
    //     id: string,
    //     url: string,
    //     urlMachine: string
    // },
    previewText: string | null,
    previewTextType: string,
    [key: string]: string | number | null | boolean | { //пользовательские поля
        value: string,
        valueId: string
    } | {
        value: string,
        valueId: string
    }[],

    purchasingCurrency: "RUB",
    purchasingPrice: string,
    quantity: number,
    quantityReserved: number,
    quantityTrace: "Y" | "N",
    sort: number,
    subscribe: "Y" | "N",
    timestampX: string,
    type: number,
    vatId: number,
    vatIncluded: "Y" | "N",
    weight: number,
    width: number,
    xmlId: string
}