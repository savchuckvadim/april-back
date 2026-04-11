export interface IBXRequisite {
    [key: string]: string | number | string[] | number[] | boolean | undefined;
    ID: number;
    ENTITY_TYPE_ID: number;
    ENTITY_ID: number;
    PRESET_ID: number;
    NAME: string;
    ACTIVE: string;
    SORT: number;
    RQ_COMPANY_NAME?: string;
    RQ_INN?: string;
    RQ_KPP?: string;
    RQ_OGRN?: string;
    RQ_ADDR?: string;
}
