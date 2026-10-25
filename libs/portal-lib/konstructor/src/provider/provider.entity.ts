import { ApiProperty } from '@nestjs/swagger';

const text = (description: string) =>
    ApiProperty({ description, type: String, nullable: true });

/** Поставщик портала (таблица `agents`). */
export class ProviderEntity {
    @ApiProperty({ description: 'Id поставщика (agents.id)', type: String })
    id: string;

    @ApiProperty({ description: 'Название поставщика', type: String })
    name: string;

    @ApiProperty({ description: 'Id набора реквизитов (rqs.id)', type: String })
    rqId: string;

    @ApiProperty({ description: 'Домен портала', type: String })
    domain: string;

    @ApiProperty({
        description: 'Работает с НДС: цены строк умножаются на 1.05',
        type: Boolean,
    })
    withTax: boolean;
}

/** Реквизиты поставщика (таблица `rqs`). Текстовые поля в БД nullable. */
export class RqEntity {
    @ApiProperty({ description: 'Id реквизитов', type: Number })
    id: number;

    @text('Наименование набора реквизитов') name: string;
    @text('Порядковый номер/код набора') number: string;
    @ApiProperty({
        description: 'Тип реквизитов: организация / ИП / физлицо',
        type: String,
    })
    type: string;
    @text('Полное юридическое наименование') fullname: string;
    @text('Краткое наименование') shortname: string;
    @text('ФИО руководителя') director: string;
    @text('Должность руководителя') position: string;
    @text('ФИО главного бухгалтера') accountant: string;
    @text('Основание полномочий руководителя') based: string;
    @text('ИНН') inn: string;
    @text('КПП') kpp: string;
    @text('ОГРН') ogrn: string;
    @text('ОГРНИП') ogrnip: string;
    @text('ФИО физического лица') personName: string;
    @text('Документ, удостоверяющий личность') document: string;
    @text('Серия документа') docSer: string;
    @text('Номер документа') docNum: string;
    @text('Дата выдачи документа') docDate: string;
    @text('Кем выдан документ') docIssuedBy: string;
    @text('Код подразделения') docDepCode: string;
    @text('Юридический адрес') registredAdress: string;
    @text('Фактический адрес') primaryAdresss: string;
    @text('E-mail') email: string;
    @text('E-mail для гарантийных писем') garantEmail: string;
    @text('Телефон') phone: string;
    @text('Ответственное лицо') assigned: string;
    @text('Телефон ответственного лица') assignedPhone: string;
    @text('Прочая информация') other: string;
    @text('Банк') bank: string;
    @text('БИК') bik: string;
    @text('Расчётный счёт') rs: string;
    @text('Корреспондентский счёт') ks: string;
    @text('Адрес банка') bankAdress: string;
    @text('Прочая информация о банке') bankOther: string;

    @ApiProperty({
        description: 'QR-коды оплаты (сырые записи)',
        type: [Object],
    })
    qrs: unknown[];

    @ApiProperty({ description: 'Работает с НДС', type: Boolean })
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
    @ApiProperty({ description: 'Реквизиты поставщика', type: RqEntity })
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
