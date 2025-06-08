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