import { CONTRACT_LTYPE } from "./contract.type";



export enum BX_ADDRESS_TYPE {
    PRIMARY = 1,
    REGISTERED = 6,
    REGISTERED_FIZ = 4,

}
export const addressMap = {
    [BX_ADDRESS_TYPE.PRIMARY]: { name_type: "Фактический адрес", code: "fact" },
    [BX_ADDRESS_TYPE.REGISTERED]: { name_type: "Юридический адрес", code: "registred" },
    [BX_ADDRESS_TYPE.REGISTERED_FIZ]: { name_type: "Адрес прописки", code: "registred_fiz" },
} as const;

// Тип для ключей (type_id)
export type AddressTypeId = keyof typeof addressMap;

// Тип для значений
export type AddressDetails = typeof addressMap[AddressTypeId];

export enum SupplyTypeEnum {
    INTERNET = 'internet',
    PROXIMA = 'proxima'
}

export type SupplyTypesType = SupplyTypeEnum.INTERNET | SupplyTypeEnum.PROXIMA

export enum RQ_TYPE {
    ORGANIZATION = "org",
    BUDGET = "org_state",
    IP = "ip",
    FIZ = "fiz",
    ADVOKAT = "advokat",
}
export enum RQ_TYPE_NAME {
    ORGANIZATION = "Организация",
    BUDGET = "Бюджетники",
    IP = "ИП",
    FIZ = "Физ лицо",
    ADVOKAT = "Адвокат",
}

export enum CONTRACT_RQ_GROUP {
    RQ = "rq",
    BANK = "bank",
    ADDRESS = "address",
    CONTRACT = "contract",
    SPECIFICATION = "specification",
    SUPPLY = "supply",
}

export enum RQ_ITEM_CODE {
    FULLNAME = 'fullname',
    SHORTNAME = 'shortname',
    PERSON_NAME = 'personName',
    LAST_NAME = 'last_name',
    FIRST_NAME = 'first_name',
    SECOND_NAME = 'second_name',


    DIRECTOR_NAME = 'director',
    DIRECTOR_POSITION = 'position',
    DIRECTOR_CASE = 'director_case',
    DIRECTOR_POSITION_CASE = 'position_case',
    BASED = 'based',
    BASED_CASE = 'based_case',

    INN = 'inn',
    KPP = 'kpp',
    OGRN = 'ogrn',
    OGRNIP = 'ogrnip',
    ACCOUNTANT = 'accountant', //fio gb

    OKPO = 'okpo',
    OKVED = 'okved',
    OKVED_DESCRIPTION = 'okved_description',
    OKVED_DESCRIPTION_CASE = 'okved_description_case',


    PHONE = 'phone',
    DOCUMENT = 'document',
    DOCUMENT_DATE = 'docDate',
    DOCUMENT_SERIES = 'docSer',
    DOCUMENT_NUMBER = 'docNum',
    ISSUED_BY = 'issued_by',
    DEPARTMENT_CODE = 'dep_code',


}
export enum ADDRESS_RQ_ITEM_CODE {
    ADDRESS_COUNTRY = 'address_country',
    ADDRESS_REGION = 'address_region',
    ADDRESS_CITY = 'address_city',
    ADDRESS_1 = 'address_1',
    ADDRESS_2 = 'address_2',
    ADDRESS_POSTAL_CODE = 'address_postal_code',
}

export enum BANK_RQ_ITEM_CODE {
    BANK_NAME = 'bank_name',
    BANK_BIK = 'bank_bik',
    BANK_PC = 'bank_pc',
    BANK_KC = 'bank_kc',
    BANK_COMMENTS = 'comments',
    BANK_ADDRESS = 'bank_address',
}
export interface RqItem<T extends string> {
    type: "string" | "text" | "date" | 'file' | 'select';
    name: string;
    isRequired: boolean;
    code: T;
    includes: Array<RQ_TYPE>;
    supplies?: Array<SupplyTypesType>;
    contractType?: Array<CONTRACT_LTYPE>;
    group: CONTRACT_RQ_GROUP;
    isActive: boolean;
    isDisable: boolean;
    order: number;
    component?: "base" | "contract" | "invoice" | "client";
    isHidden?: boolean; //скрытый
    
}


export type BankRqItemType = RqItem<BANK_RQ_ITEM_CODE>
export type AddressRqItemType = RqItem<ADDRESS_RQ_ITEM_CODE>
export type RqItemType = RqItem<RQ_ITEM_CODE>

