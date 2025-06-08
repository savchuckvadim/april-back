export type Contract = {
    number: ContractNumberType
    aprilName: ContractNamesType
    shortName: CONTRACT_CODE
    code?: CONTRACT_CODE
    measureNumber: 0 | 1 | 2 | 3 | 4 | 5 | 6
    measureId: number
    measureCode: number
    measureName: MeasureNamesType
    measureFullName: MeasureFullNamesType
    prepayment: 1,
    contractCoefficient: ContractCoefficientsType
    discount: ContractDiscountType
    type: ContractsType
    productName: string // 'услуги по сопровождениюб лицензияб услуга по прдоставлению ключа'

}


export enum CONTRACT_CODE {
    INTERNET = 'internet',
    PROXIMA = 'proxima',
    ABON6 = 'abonHalf',
    ABON12 = 'abonYear',
    ABON24 = 'abonTwoYears',
    LIC = 'lic',
    LIC6 = 'licHalf',
    LIC12 = 'licYear',
    LIC24 = 'licTwoYears',
    KEY = 'key',
}

export type ContractNumberType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export type ContractNamesType =
    'Интренет' |
    'Договор услуг' |
    'Абонентский полгода' |
    'Абонентский год' |
    'Лицензионный' |
    'Лицензионный полгода' |
    'Лицензионный год' |
    'Абонентский 2 года' |
    'Лицензионный 2 года' |
    'Абонентский' |
    'Лицензионный' | 'Передача ключа доступа'


export enum CONTRACT_CODE {
    internet = 'internet',
    proxima = 'proxima',
    abonHalf = 'abonHalf',
    abonYear = 'abonYear',
    lic = 'lic',
    key = 'key',
    licHalf = 'licHalf',
    licYear = 'licYear',
    abonTwoYears = 'abonTwoYears',
    licTwoYears = 'licTwoYears',
}
export type ContractShortNamesType = CONTRACT_CODE


export type MeasureNumberType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export type MeasureNamesType =
    'мес.' |
    'абон. 6 мес.' |
    'абон. 12 мес.' |
    'шт.' |
    'лиц. 6 мес.' |
    'лиц. 12 мес.' |
    'абон. 24 мес.' |
    'лиц. 24 мес.'

export type MeasureFullNamesType =
    'Месяц' |
    'Штука' |
    'Абонемент 6 месяцев' |
    'Абонемент 12 месяцев' |
    'Лицензия' |
    'Лицензия 6 месяцев' |
    'Лицензия 12 месяцев' |
    'Абонемент 24 месяцев' |
    'Лицензия 24 месяцев'


export type ContractCoefficientsType = 1 | 6 | 12 | 24
export type ContractDiscountType = 1 | 0.9 | 0.8 | 0.7



export type AllContractsType = {
    universal: ContractGroupType
    prof: ContractGroupType
}
export type ContractGroupType = {
    [c: string]: Array<Contract>


}

type ContractsType = 'internet' | 'proxima'


export type RememberContracts = {
    items: Array<Contract>
    current: Contract
}

export enum CONTRACT_LTYPE {

    SERVICE = 'service',
    ABON = 'abon',
    LIC = 'lic',
    KEY = 'key',
}
