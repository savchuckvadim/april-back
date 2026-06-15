export class ProviderEntity {
    id: string;
    name: string;
    rqId: string;
    domain: string;
    withTax: boolean;
}

export class RqEntity {
    id: number;
    name: string;
    number: string;
    type: string;
    fullname: string;
    shortname: string;
    director: string;
    position: string;
    accountant: string;
    based: string;
    inn: string;
    kpp: string;
    ogrn: string;
    ogrnip: string;
    personName: string;
    document: string;
    docSer: string;
    docNum: string;
    docDate: string;
    docIssuedBy: string;
    docDepCode: string;
    registredAdress: string;
    primaryAdresss: string;
    email: string;
    garantEmail: string;
    phone: string;
    assigned: string;
    assignedPhone: string;
    other: string;
    bank: string;
    bik: string;
    rs: string;
    ks: string;
    bankAdress: string;
    bankOther: string;
    qrs: any[];
    withTax: boolean;
    // logos: LogoEntity[];
    // stamps: LogoEntity[];
    // signatures: LogoEntity[];
}

export class LogoEntity {
    name: string;
    code: string;
    type: string;
    path: string;
}

export class ProviderEntityWithRq extends ProviderEntity {
    rq: RqEntity;
}

/**
 * Набор реквизитов (rqs) для создания/обновления.
 * Все поля, кроме `type`, опциональны — в БД они nullable.
 */
export class RqInput {
    type: string;
    name?: string;
    number?: string;
    fullname?: string;
    shortname?: string;
    director?: string;
    position?: string;
    accountant?: string;
    based?: string;
    inn?: string;
    kpp?: string;
    ogrn?: string;
    ogrnip?: string;
    personName?: string;
    document?: string;
    docSer?: string;
    docNum?: string;
    docDate?: string;
    docIssuedBy?: string;
    docDepCode?: string;
    registredAdress?: string;
    primaryAdresss?: string;
    email?: string;
    garantEmail?: string;
    phone?: string;
    assigned?: string;
    assignedPhone?: string;
    other?: string;
    bank?: string;
    bik?: string;
    rs?: string;
    ks?: string;
    bankAdress?: string;
    bankOther?: string;
}

/**
 * Данные для создания поставщика (agents) вместе с его реквизитами (rqs).
 */
export class CreateProviderWithRqInput {
    /** Домен портала, к которому привязывается поставщик. */
    domain: string;
    type: string;
    name: string;
    code: string;
    number: string;
    withTax: boolean;
    rq: RqInput;
}
