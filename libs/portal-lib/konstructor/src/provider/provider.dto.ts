import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { IsArray } from 'class-validator';
import { ValidateNested } from 'class-validator';
import { IsNotEmpty } from 'class-validator';
import { IsOptional } from 'class-validator';
import { IsNumber } from 'class-validator';
import { IsString } from 'class-validator';
import {
    CreateProviderWithRqInput,
    ProviderEntityWithRq,
    RqEntity,
    RqInput,
} from './provider.entity';

class LogoDto {
    @IsString() name: string;
    @IsString() code: string;
    @IsString() type: string;
    @IsString() path: string;
}

class RqDto {
    @IsNumber() id: number;
    @IsString() number: string;
    @IsString() name: string;
    @IsString() type: string;
    @IsString() fullname: string;
    @IsString() shortname: string;
    @IsString() director: string;
    @IsString() position: string;
    @IsOptional() @IsString() accountant: string;
    @IsString() based: string;
    @IsString() inn: string;
    @IsOptional() @IsString() kpp: string;
    @IsOptional() @IsString() ogrn: string;
    @IsOptional() @IsString() ogrnip: string;
    @IsOptional() @IsString() personName: string;
    @IsOptional() @IsString() document: string;
    @IsOptional() @IsString() docSer: string;
    @IsOptional() @IsString() docNum: string;
    @IsOptional() @IsString() docDate: string;
    @IsOptional() @IsString() docIssuedBy: string;
    @IsOptional() @IsString() docDepCode: string;
    @IsString() registredAdress: string;
    @IsString() primaryAdresss: string;
    @IsString() email: string;
    @IsOptional() @IsString() garantEmail: string;
    @IsString() phone: string;
    @IsOptional() @IsString() assigned: string;
    @IsOptional() @IsString() assignedPhone: string;
    @IsOptional() @IsString() other: string;
    @IsString() bank: string;
    @IsString() bik: string;
    @IsString() rs: string;
    @IsString() ks: string;
    @IsString() bankAdress: string;
    @IsOptional() @IsString() bankOther: string;
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LogoDto)
    logos: LogoDto[];
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LogoDto)
    stamps: LogoDto[];
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LogoDto)
    signatures: LogoDto[];
    @IsArray() qrs: any[];
    @IsString() domain: string;
}

export class ProviderDto {
    @IsNumber() id: number;
    @IsString() name: string;
    @IsString() code: string;
    @IsString() type: string;
    @IsBoolean() withTax: boolean;
    @ValidateNested() @Type(() => RqDto) rq: RqDto;
}

/**
 * Реквизиты поставщика для создания/обновления (таблица `rqs`).
 * Обязателен только `type`; остальные поля в БД nullable.
 */
export class CreateRqDto implements RqInput {
    @ApiProperty({
        description:
            'Тип реквизитов (организация/ИП/физлицо). Определяет состав ' +
            'обязательных юридических полей.',
        example: 'organization',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({
        description: 'Наименование набора реквизитов в интерфейсе.',
        example: 'ООО «Ромашка»',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiProperty({
        description: 'Порядковый номер/код набора реквизитов.',
        example: '1',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    number?: string;

    @ApiProperty({
        description: 'Полное юридическое наименование.',
        example: 'Общество с ограниченной ответственностью «Ромашка»',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    fullname?: string;

    @ApiProperty({
        description: 'Краткое наименование.',
        example: 'ООО «Ромашка»',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    shortname?: string;

    @ApiProperty({
        description: 'ФИО руководителя.',
        example: 'Иванов Иван Иванович',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    director?: string;

    @ApiProperty({
        description: 'Должность руководителя.',
        example: 'Генеральный директор',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    position?: string;

    @ApiProperty({
        description: 'ФИО главного бухгалтера.',
        example: 'Петрова Анна Сергеевна',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    accountant?: string;

    @ApiProperty({
        description: 'Основание полномочий руководителя (устав/доверенность).',
        example: 'Устава',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    based?: string;

    @ApiProperty({
        description: 'ИНН.',
        example: '7701234567',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    inn?: string;

    @ApiProperty({
        description: 'КПП.',
        example: '770101001',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    kpp?: string;

    @ApiProperty({
        description: 'ОГРН (для юридических лиц).',
        example: '1027700000000',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    ogrn?: string;

    @ApiProperty({
        description: 'ОГРНИП (для индивидуальных предпринимателей).',
        example: '304770000000000',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    ogrnip?: string;

    @ApiProperty({
        description: 'ФИО физического лица (для типа «физлицо»).',
        example: 'Сидоров Пётр Петрович',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    personName?: string;

    @ApiProperty({
        description: 'Тип документа, удостоверяющего личность.',
        example: 'Паспорт РФ',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    document?: string;

    @ApiProperty({
        description: 'Серия документа.',
        example: '4500',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    docSer?: string;

    @ApiProperty({
        description: 'Номер документа.',
        example: '123456',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    docNum?: string;

    @ApiProperty({
        description: 'Дата выдачи документа.',
        example: '01.01.2010',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    docDate?: string;

    @ApiProperty({
        description: 'Кем выдан документ.',
        example: 'ОВД района Замоскворечье г. Москвы',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    docIssuedBy?: string;

    @ApiProperty({
        description: 'Код подразделения, выдавшего документ.',
        example: '770-001',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    docDepCode?: string;

    @ApiProperty({
        description: 'Юридический (зарегистрированный) адрес.',
        example: '101000, г. Москва, ул. Мясницкая, д. 1',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    registredAdress?: string;

    @ApiProperty({
        description: 'Фактический (основной) адрес.',
        example: '101000, г. Москва, ул. Мясницкая, д. 1, оф. 2',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    primaryAdresss?: string;

    @ApiProperty({
        description: 'Контактный e-mail.',
        example: 'info@romashka.ru',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    email?: string;

    @ApiProperty({
        description: 'E-mail для гарантийных писем.',
        example: 'garant@romashka.ru',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    garantEmail?: string;

    @ApiProperty({
        description: 'Контактный телефон.',
        example: '+7 495 123-45-67',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiProperty({
        description: 'Ответственное (уполномоченное) лицо.',
        example: 'Кузнецова Мария Ивановна',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    assigned?: string;

    @ApiProperty({
        description: 'Телефон ответственного лица.',
        example: '+7 495 765-43-21',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    assignedPhone?: string;

    @ApiProperty({
        description: 'Прочая дополнительная информация.',
        example: 'Работаем без НДС',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    other?: string;

    @ApiProperty({
        description: 'Наименование банка.',
        example: 'ПАО Сбербанк',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    bank?: string;

    @ApiProperty({
        description: 'БИК банка.',
        example: '044525225',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    bik?: string;

    @ApiProperty({
        description: 'Расчётный счёт.',
        example: '40702810500000000001',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    rs?: string;

    @ApiProperty({
        description: 'Корреспондентский счёт.',
        example: '30101810400000000225',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    ks?: string;

    @ApiProperty({
        description: 'Адрес банка.',
        example: '117997, г. Москва, ул. Вавилова, д. 19',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    bankAdress?: string;

    @ApiProperty({
        description: 'Прочая информация о банке.',
        example: 'Отделение №1234',
        required: false,
        type: String,
    })
    @IsOptional()
    @IsString()
    bankOther?: string;
}

/**
 * Данные для создания поставщика (`agents`) вместе с реквизитами (`rqs`).
 */
export class CreateProviderWithRqDto implements CreateProviderWithRqInput {
    @ApiProperty({
        description: 'Домен портала, к которому привязывается поставщик.',
        example: 'company.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Тип поставщика (организация/ИП/физлицо).',
        example: 'organization',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({
        description: 'Название поставщика для интерфейса.',
        example: 'ООО «Ромашка»',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Бизнес-код поставщика.',
        example: 'romashka',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description: 'Порядковый номер поставщика.',
        example: '1',
        type: String,
    })
    @IsString()
    number: string;

    @ApiProperty({
        description: 'Признак работы с НДС.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    withTax: boolean;

    @ApiProperty({
        description: 'Реквизиты создаваемого поставщика.',
        type: CreateRqDto,
    })
    @ValidateNested()
    @Type(() => CreateRqDto)
    rq: CreateRqDto;
}

/**
 * Данные для частичного обновления реквизитов (`rqs`).
 * Все поля опциональны — обновляются только переданные.
 */
export class UpdateRqDto
    extends PartialType(CreateRqDto)
    implements Partial<RqInput> {}

/** Ответ с реквизитами поставщика. */
export class RqResponseDto extends RqEntity {}

/** Ответ с поставщиком и его реквизитами. */
export class ProviderWithRqResponseDto extends ProviderEntityWithRq {}
