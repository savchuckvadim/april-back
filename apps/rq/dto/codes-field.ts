import { IncludesEnum } from './includes.enum';

export class Names {
    name: string;
    type: string;
    code: string;
    includes: IncludesEnum[];
    order?: number | null;

    constructor(data: Partial<Names>) {
        this.name = data.name || '';
        this.type = data.type || '';
        this.code = data.code || '';
        this.includes = data.includes || [];
        this.order = data.order ?? 300;
    }
}

export class CodesField {
    static RQ_COMPANY_FULL_NAME = new Names({
        name: 'Полное наименование организации',
        type: 'string',
        code: 'fullname',
        includes: [IncludesEnum.org, IncludesEnum.ip],
        order: 100,
    });

    static RQ_COMPANY_NAME = new Names({
        name: 'Сокращенное наименование организации',
        type: 'string',
        code: 'shortname',
        includes: [IncludesEnum.org, IncludesEnum.ip],
        order: 101,
    });

    static RQ_DIRECTOR = new Names({
        name: 'ФИО руководителя организации',
        type: 'string',
        code: 'director',
        includes: [IncludesEnum.org],
        order: 102,
    });

    static RQ_DIRECTOR_CASE = new Names({
        name: 'ФИО руководителя организации (в лице)',
        type: 'string',
        code: 'director_case',
        includes: [IncludesEnum.org],
        order: 103,
    });

    static RQ_POSITION = new Names({
        name: 'Должность',
        type: 'string',
        code: 'position',
        includes: [IncludesEnum.org],
        order: 104,
    });

    static RQ_POSITION_CASE = new Names({
        name: 'Должность (в лице)',
        type: 'string',
        code: 'position_case',
        includes: [IncludesEnum.org],
        order: 105,
    });

    static RQ_BASED = new Names({
        name: 'Действующего на основании',
        type: 'string',
        code: 'based',
        includes: [IncludesEnum.org, IncludesEnum.ip],
        order: 106,
    });

    static RQ_BASED_CASE = new Names({
        name: 'Действующего на основании (в род. пад.)',
        type: 'string',
        code: 'based_case',
        includes: [IncludesEnum.org, IncludesEnum.ip],
        order: 107,
    });

    static RQ_BASE_OTHER = new Names({
        //1773131028
        name: 'Дополнительные реквизиты',
        type: 'string',
        code: 'base_other',
        includes: [IncludesEnum.org, IncludesEnum.ip, IncludesEnum.fiz],
        order: 110,
    });

    static RQ_LAST_NAME = new Names({
        name: 'Фамилия',
        type: 'string',
        code: 'last_name',
        includes: [IncludesEnum.fiz, IncludesEnum.ip],
        order: 49,
    });

    static RQ_FIRST_NAME = new Names({
        name: 'Имя',
        type: 'string',
        code: 'first_name',
        includes: [IncludesEnum.fiz, IncludesEnum.ip],
        order: 50,
    });

    static RQ_SECOND_NAME = new Names({
        name: 'Отчество',
        type: 'string',
        code: 'second_name',
        includes: [IncludesEnum.fiz, IncludesEnum.ip],
        order: 51,
    });

    static RQ_NAME = new Names({
        name: 'ФИО',
        type: 'string',
        code: 'personName',
        includes: [IncludesEnum.fiz, IncludesEnum.ip],
        order: 102,
    });

    static RQ_INN = new Names({
        name: 'ИНН',
        type: 'string',
        code: 'inn',
        includes: [IncludesEnum.org, IncludesEnum.ip],
    });

    static RQ_KPP = new Names({
        name: 'КПП',
        type: 'string',
        code: 'kpp',
        includes: [IncludesEnum.org, IncludesEnum.ip],
    });

    static RQ_OGRN = new Names({
        name: 'ОГРН',
        type: 'string',
        code: 'ogrn',
        includes: [IncludesEnum.org],
    });

    static RQ_OKPO = new Names({
        name: 'ОКРО',
        type: 'string',
        code: 'okpo',
        includes: [IncludesEnum.org, IncludesEnum.ip],
    });

    static RQ_OGRNIP = new Names({
        name: 'ОГРНИП',
        type: 'string',
        code: 'ogrnip',
        includes: [IncludesEnum.ip],
    });

    static RQ_ACCOUNTANT = new Names({
        name: 'ФИО главного бухгалтера организации',
        type: 'string',
        code: 'accountant',
        includes: [IncludesEnum.org],
    });

    static RQ_PHONE = new Names({
        name: 'Телефон',
        type: 'string',
        code: 'phone',
        includes: [IncludesEnum.ip, IncludesEnum.org, IncludesEnum.fiz],
    });

    static RQ_IDENT_DOC = new Names({
        name: 'Вид Документа',
        type: 'string',
        code: 'document',
        includes: [IncludesEnum.fiz],
    });

    static RQ_IDENT_DOC_SER = new Names({
        name: 'Серия Документа',
        type: 'string',
        code: 'docSer',
        includes: [IncludesEnum.fiz],
    });

    static RQ_IDENT_DOC_NUM = new Names({
        name: 'Номер Документа',
        type: 'string',
        code: 'docNum',
        includes: [IncludesEnum.fiz],
    });

    static RQ_IDENT_DOC_DATE = new Names({
        name: 'Дата Выдачи Документа',
        type: 'string',
        code: 'docDate',
        includes: [IncludesEnum.fiz],
    });

    static RQ_IDENT_DOC_ISSUED_BY = new Names({
        name: 'Документ выдан подразделением',
        type: 'string',
        code: 'issued_by',
        includes: [IncludesEnum.fiz],
    });

    static RQ_IDENT_DOC_DEP_CODE = new Names({
        name: 'Код подразделения',
        type: 'string',
        code: 'dep_code',
        includes: [IncludesEnum.fiz],
    });

    static address = new Names({
        name: 'Адрес',
        type: 'enumeration',
        code: 'address',
        includes: [IncludesEnum.fiz, IncludesEnum.org, IncludesEnum.ip],
    });

    static bank = new Names({
        name: 'Банковские реквизиты',
        type: 'enumeration',
        code: 'bank',
        includes: [IncludesEnum.fiz, IncludesEnum.org, IncludesEnum.ip],
    });
}
