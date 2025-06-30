export interface IPortal {
    domain: string;
    apiKey: string;
    C_REST_WEB_HOOK_URL: string;
    C_REST_CLIENT_SECRET: string;
    C_REST_CLIENT_ID: string;
    key: string;
    name?: string;
    description?: string;
    createdAt?: Date;
    updatedAt?: Date;
    access_key?: string;
    lists?: IPBXList[];
    bitrixLists?: IPBXList[];
    id?: number;
    departament?: IDepartment;
    smarts?: IPSmart[];
    // deal?: IDeal;
    deals: IDeal[];
    rpas?: IRPA[];
    company?: ICompany;
    contact?: IContact;
    lead?: Record<string, any>;
    bx_rq?: IPresetRQ[];
    measures: IPPortalMeasure[];
}

export interface IFieldItem {
    id: number;
    created_at: Date;
    updated_at: Date;
    bitrixfield_id: number;
    name: string;
    title: string;
    code: string;
    bitrixId: number;
}

export interface IField {
    ID?: number;
    type: string;
    code: IFieldCode;
    name: string;
    title: string;
    bitrixId: string;
    bitrixCamelId: string;
    entity_id?: number;
    parent_type?: string;
    bitrixfielditems?: Record<string, any>;
    items: IFieldItem[];
}
export type IFieldCode =
    'ork_current_contract_fin_date' |
    'supply_date' |
    'sales_kpi_event_date' |
    'sales_kpi_event_type' | string
export interface ICategory {
    id: number;
    type: string;
    group: string;
    name: string;
    title: string;
    bitrixId: string;
    bitrixCamelId: string;
    code: string;
    isActive: number;
    entity_id: number;
    entity_type: string;
    parent_type: string;
    stages: IStage[];
}

export interface IStage {
    id: number;
    created_at: string;
    updated_at: string;
    btx_category_id: number;
    name: string;
    title: string;
    code: string;
    bitrixId: string;
    color: string;
    isActive: number;
}

export interface IRPA {
    id: number;
    created_at: string;
    updated_at: string;
    name: string;
    title: string;
    code: string;
    type: string;
    image: string;
    bitrixId: number;
    typeId: string;
    description: string;
    entityTypeId: number;
    forStageId: number;
    forFilterId: number;
    crmId: number;
    portal_id: number;
    categories: ICategory[];
    bitrixfields: IField[];
}

export interface IPSmart {
    id: number;
    portal_id: number;
    type: string;
    group: string;
    name: string;
    title: string;
    bitrixId: number;
    entityTypeId: number;
    forStageId: number;
    forStage: string;
    crmId: number;
    crm: string;
    forFilterId: number;
    forFilter: string;
    bitrixfields: IField[];
    fields: IField[];
    categories: ICategory[];
}

export interface IPresetRQ {
    id: number;
    portal_id: number;
    name: string;
    code: string;
    type: string;
    bitrix_id: number;
    xml_id: string;
    entity_type_id: number;
    country_id: string;
    is_active: boolean;
    sort: number;
}

export interface IDepartment {
    id: number;
    type: string;
    group: EDepartamentGroup;
    name: string;
    title: string;
    bitrixId: number;
    portal_id: number;
}
export enum EDepartamentGroup {
    sales = 'sales',
    service = 'service',
    tmc = 'tmc'
}
export interface IDeal {
    id: number;
    portal_id: number;
    code: string;
    name: string;
    title: string;
    categories: ICategory[];
    bitrixfields: IField[];
}

export interface IContact {
    id: number;
    portal_id: number;
    code: string;
    name: string;
    title: string;
    bitrixfields: IField[];
}

export interface ICompany {
    id: number;
    portal_id: number;
    code: string;
    name: string;
    title: string;
    bitrixfields: IField[];
}

export interface IPBXList {
    group: string;
    type: string;
    bitrixId: string | number;
    ID?: number;
    title: string;
    name: string;
    fields?: IField[];
    bitrixfields?: IField[];
}



export interface IPortalResponse {
    success: boolean;
    data?: IPortal;
    error?: string;
}

export interface IPDepartment {
    id: number
    group: string
    type: string
    bitrixId: number
}


export interface IPMeasure {
    id: number;
    created_at: string;
    updated_at: string;
    name: string;
    shortName: string;
    fullName: string;
    code: PMeasureCode;
    type: 'service' | 'product' | 'lic' | 'abon' | string;
}

export interface IPPortalMeasure {
    id: number;
    measure_id: number;
    portal_id: number;
    bitrixId: string;
    name: string;
    shortName: string;
    fullName: string;
    created_at: string;
    updated_at: string;
    measure: IPMeasure;
}

export type PMeasureCode =
    | 'month'
    | 'piece'
    | 'licHalf'
    | 'licYear'
    | 'licTwoYears'
    | 'abonHalf'
    | 'abonYear'
    | 'abonTwoYears';