import { ApiProperty } from '@nestjs/swagger';
import { InstallEntityFieldDto } from '@app/pbx-install/shared';
import { ListFolderEnum, ListGroupEnum } from '../type/parse.type';

/** Эталонный список из Excel-шаблона (предпросмотр установки). */
export class ListTemplateDto {
    @ApiProperty({ description: 'id строки в шаблоне', example: '0' })
    id!: string;

    @ApiProperty({
        description:
            'Папка шаблона-источника (listName для install-эндпоинтов)',
        enum: ListFolderEnum,
        example: ListFolderEnum.KPI,
    })
    sourceListName!: ListFolderEnum;

    @ApiProperty({
        description:
            'Группа папки шаблона-источника (group для install-эндпоинтов; ' +
            'может отличаться от group самого списка)',
        enum: ListGroupEnum,
        example: ListGroupEnum.SALES,
    })
    sourceGroup!: ListGroupEnum;

    @ApiProperty({
        description: 'Тип списка (`bitrixlists.type`)',
        example: 'kpi',
    })
    type!: string;

    @ApiProperty({
        description: 'Группа отдела (`bitrixlists.group`)',
        example: 'sales',
    })
    group!: string;

    @ApiProperty({
        description: 'Человекочитаемое название (NAME в Bitrix)',
        example: 'ОП KPI',
    })
    name!: string;

    @ApiProperty({
        description: 'IBLOCK_CODE из шаблона',
        example: 'kpi',
    })
    code!: string;

    @ApiProperty({ description: 'Порядок сортировки', example: 1 })
    order!: number;

    @ApiProperty({
        description: 'Эталонные поля списка',
        type: [InstallEntityFieldDto],
    })
    fields!: InstallEntityFieldDto[];
}

/** Эталон списков для предпросмотра (Monitoring/parse). */
export class ListParseResponseDto {
    @ApiProperty({
        description: 'Эталонные списки со всеми полями',
        type: [ListTemplateDto],
    })
    lists!: ListTemplateDto[];
}

/** Значение enum-поля списка в PortalDB. */
export class PortalListFieldItemDto {
    @ApiProperty({ description: 'Название значения', example: 'Звонок' })
    name!: string;

    @ApiProperty({ description: 'Код значения', example: 'call' })
    code!: string;

    @ApiProperty({
        description: 'ID значения в Bitrix',
        example: 457,
        type: Number,
    })
    bitrixId!: number;
}

/** Поле списка в PortalDB (`bitrixfields`, entity_type=BITRIX_LIST). */
export class PortalListFieldDto {
    @ApiProperty({
        description: 'ID строки в БД',
        example: '15',
        nullable: true,
        type: String,
    })
    id!: string | null;

    @ApiProperty({ description: 'Название поля', example: 'Тип События' })
    name!: string;

    @ApiProperty({ description: 'Код поля', example: 'event_type' })
    code!: string;

    @ApiProperty({ description: 'Тип поля', example: 'enumeration' })
    type!: string;

    @ApiProperty({ description: 'Множественное поле', example: false })
    isPlural!: boolean;

    @ApiProperty({
        description: 'CODE свойства в Bitrix',
        example: 'EVENT_TYPE',
    })
    bitrixId!: string;

    @ApiProperty({
        description:
            'FIELD_ID свойства в Bitrix (PROPERTY_N) — его передают в lists.element.*',
        example: 'PROPERTY_101',
    })
    bitrixCamelId!: string;

    @ApiProperty({
        description: 'Значения enum-поля',
        type: [PortalListFieldItemDto],
    })
    items!: PortalListFieldItemDto[];
}

/** Список портала в PortalDB (`bitrixlists`) с полями. */
export class PortalListDto {
    @ApiProperty({ description: 'ID строки в БД', example: 7, type: Number })
    id!: number;

    @ApiProperty({ description: 'ID портала', example: 3, type: Number })
    portalId!: number;

    @ApiProperty({ description: 'Тип списка', example: 'kpi' })
    type!: string;

    @ApiProperty({ description: 'Группа отдела', example: 'sales' })
    group!: string;

    @ApiProperty({ description: 'Название', example: 'ОП KPI' })
    name!: string;

    @ApiProperty({ description: 'Заголовок', example: 'ОП KPI' })
    title!: string;

    @ApiProperty({
        description: 'IBLOCK_ID инфоблока в Bitrix',
        example: 41,
        type: Number,
    })
    bitrixId!: number;

    @ApiProperty({
        description: 'Код списка (`${group}_${type}`)',
        example: 'sales_kpi',
    })
    code!: string;

    @ApiProperty({
        description: 'Поля списка из PortalDB',
        type: [PortalListFieldDto],
    })
    fields!: PortalListFieldDto[];
}

/** Списки портала (PortalDB). */
export class PortalListsResponseDto {
    @ApiProperty({ description: 'ID портала', example: 3, type: Number })
    id!: number;

    @ApiProperty({
        description: 'Домен портала',
        example: 'example.bitrix24.ru',
        nullable: true,
        type: String,
    })
    domain!: string | null;

    @ApiProperty({ description: 'Списки портала', type: [PortalListDto] })
    lists!: PortalListDto[];
}

/** Результат создания/актуализации инфоблока в Bitrix. */
export class BxEnsuredListDto {
    @ApiProperty({
        description: 'IBLOCK_ID в Bitrix',
        example: 41,
        type: Number,
    })
    bitrixId!: number;

    @ApiProperty({
        description: 'Фактический IBLOCK_CODE (существующего или созданного)',
        example: 'kpi',
    })
    code!: string;

    @ApiProperty({ description: 'Инфоблок создан', example: true })
    created!: boolean;

    @ApiProperty({ description: 'NAME инфоблока обновлён', example: false })
    updated!: boolean;
}

/** Ключ списка (адресация на портале). */
export class ListKeyDto {
    @ApiProperty({ description: 'Тип списка', example: 'kpi' })
    type!: string;

    @ApiProperty({ description: 'Группа отдела', example: 'sales' })
    group!: string;

    @ApiProperty({ description: 'Код списка из шаблона', example: 'kpi' })
    code!: string;
}

/** Результат установки одного поля списка в Bitrix. */
export class InstalledListFieldResultDto {
    @ApiProperty({ description: 'Код поля', example: 'event_type' })
    code!: string;

    @ApiProperty({ description: 'Название поля', example: 'Тип События' })
    name!: string;

    @ApiProperty({
        description: 'CODE свойства в Bitrix',
        example: 'EVENT_TYPE',
    })
    bxFieldName!: string;

    @ApiProperty({
        description: 'FIELD_ID свойства (PROPERTY_N) после установки',
        example: 'PROPERTY_101',
        nullable: true,
        type: String,
    })
    fieldId!: string | null;

    @ApiProperty({ description: 'Поле установлено успешно', example: true })
    ok!: boolean;
}

/** Результат установки полей одного списка. */
export class ListFieldsInstallResultDto {
    @ApiProperty({ description: 'Ключ списка', type: ListKeyDto })
    list!: ListKeyDto;

    @ApiProperty({
        description: 'Всего полей к установке',
        example: 16,
        type: Number,
    })
    countTotal!: number;

    @ApiProperty({
        description: 'Успешно установлено',
        example: 16,
        type: Number,
    })
    countSuccess!: number;

    @ApiProperty({ description: 'С ошибкой', example: 0, type: Number })
    countFailed!: number;

    @ApiProperty({
        description: 'Коды полей с ошибками batch',
        type: [String],
        example: [],
    })
    errorCodes!: string[];

    @ApiProperty({
        description: 'Результаты по полям',
        type: [InstalledListFieldResultDto],
    })
    fields!: InstalledListFieldResultDto[];

    @ApiProperty({
        description: 'Сколько полей зеркалировано в PortalDB',
        example: 16,
        type: Number,
    })
    dbSyncedCount!: number;

    @ApiProperty({
        description: 'Служебное сообщение (например, "no fields to install")',
        required: false,
        nullable: true,
        type: String,
    })
    message?: string | null;
}

/** Результат установки одного списка целиком. */
export class InstalledListResultDto {
    @ApiProperty({ description: 'Ключ списка', type: ListKeyDto })
    list!: ListKeyDto;

    @ApiProperty({ description: 'Название списка', example: 'ОП KPI' })
    name!: string;

    @ApiProperty({ description: 'Bitrix-результат', type: BxEnsuredListDto })
    bitrix!: BxEnsuredListDto;

    @ApiProperty({
        description: 'ID строки `bitrixlists` в PortalDB',
        example: 7,
        type: Number,
    })
    portalListId!: number;

    @ApiProperty({
        description: 'Результат установки полей',
        type: ListFieldsInstallResultDto,
    })
    fields!: ListFieldsInstallResultDto;
}

/** Результат установки списков по шаблону. */
export class InstallListsResponseDto {
    @ApiProperty({
        description: 'Домен портала',
        example: 'example.bitrix24.ru',
    })
    domain!: string;

    @ApiProperty({
        description: 'Результаты по спискам шаблона',
        type: [InstalledListResultDto],
    })
    installed!: InstalledListResultDto[];
}

/** Результат удаления списка. */
export class DeletePbxListResultDto {
    @ApiProperty({
        description: 'Домен портала',
        example: 'example.bitrix24.ru',
    })
    domain!: string;

    @ApiProperty({ description: 'Тип списка', example: 'kpi' })
    type!: string;

    @ApiProperty({ description: 'Группа отдела', example: 'sales' })
    group!: string;

    @ApiProperty({
        description:
            'Инфоблок удалён в Bitrix (null — удаление в Bitrix не запрашивалось)',
        example: true,
        nullable: true,
        type: Boolean,
    })
    bitrixDeleted!: boolean | null;

    @ApiProperty({
        description: 'ID удалённой строки `bitrixlists`',
        example: 7,
        type: Number,
    })
    dbDeletedListId!: number;
}

/** Bitrix-результат удаления одного поля списка. */
export class ListFieldDeleteBxResultDto {
    @ApiProperty({ description: 'Код поля', example: 'event_type' })
    code!: string;

    @ApiProperty({
        description: 'FIELD_ID в Bitrix',
        example: 'PROPERTY_101',
        nullable: true,
        type: String,
    })
    bxFieldId!: string | null;

    @ApiProperty({ description: 'Удалено в Bitrix', example: true })
    deleted!: boolean;

    @ApiProperty({
        description: 'Текст ошибки',
        required: false,
        nullable: true,
        type: String,
    })
    error?: string | null;
}

/** Результат удаления полей списка на одном портале. */
export class PerPortalListFieldDeleteResultDto {
    @ApiProperty({
        description: 'Домен портала',
        example: 'example.bitrix24.ru',
    })
    domain!: string;

    @ApiProperty({ description: 'ID портала', example: 3, type: Number })
    portalId!: number;

    @ApiProperty({
        description: 'Bitrix-результаты по полям',
        type: [ListFieldDeleteBxResultDto],
    })
    bx!: ListFieldDeleteBxResultDto[];

    @ApiProperty({
        description: 'ID удалённых строк полей в PortalDB',
        type: [String],
        example: ['15'],
    })
    deletedDbFieldIds!: string[];

    @ApiProperty({
        description: 'Коды, не найденные в PortalDB',
        type: [String],
        example: [],
    })
    notFoundCodes!: string[];
}

/** Bitrix-результат операции над значением enum-поля. */
export class ListFieldItemBxResultDto {
    @ApiProperty({ description: 'Код поля', example: 'event_type' })
    fieldCode!: string;

    @ApiProperty({ description: 'Код значения', example: 'call' })
    itemCode!: string;

    @ApiProperty({
        description: 'FIELD_ID в Bitrix',
        example: 'PROPERTY_101',
        nullable: true,
        type: String,
    })
    bxFieldId!: string | null;

    @ApiProperty({
        description: 'ID значения в Bitrix',
        example: '457',
        nullable: true,
        type: String,
    })
    bxItemId!: string | null;

    @ApiProperty({ description: 'Операция успешна', example: true })
    ok!: boolean;

    @ApiProperty({
        description: 'Текст ошибки',
        required: false,
        nullable: true,
        type: String,
    })
    error?: string | null;
}

/** PortalDB-результат операции над значением enum-поля. */
export class ListFieldItemDbResultDto {
    @ApiProperty({ description: 'Операция успешна', example: true })
    ok!: boolean;

    @ApiProperty({
        description: 'ID значения в PortalDB',
        required: false,
        nullable: true,
        type: String,
    })
    itemId?: string | null;

    @ApiProperty({
        description: 'Текст ошибки',
        required: false,
        nullable: true,
        type: String,
    })
    error?: string | null;
}

/** Результат операции над значением enum-поля на одном портале. */
export class PerPortalListFieldItemResultDto {
    @ApiProperty({
        description: 'Домен портала',
        example: 'example.bitrix24.ru',
    })
    domain!: string;

    @ApiProperty({ description: 'ID портала', example: 3, type: Number })
    portalId!: number;

    @ApiProperty({
        description: 'Bitrix-результат',
        type: ListFieldItemBxResultDto,
    })
    bx!: ListFieldItemBxResultDto;

    @ApiProperty({
        description: 'PortalDB-результат',
        type: ListFieldItemDbResultDto,
    })
    db!: ListFieldItemDbResultDto;
}

/** Статус одного поля списка: эталон × Bitrix × БД. */
export class ListFieldMonitorRowDto {
    @ApiProperty({ description: 'Код поля', example: 'event_type' })
    code!: string;

    @ApiProperty({ description: 'Название поля', example: 'Тип События' })
    name!: string;

    @ApiProperty({
        description: 'CODE свойства в Bitrix',
        example: 'EVENT_TYPE',
    })
    bxFieldName!: string;

    @ApiProperty({ description: 'Есть в Bitrix', example: true })
    inBitrix!: boolean;

    @ApiProperty({
        description: 'FIELD_ID в Bitrix (PROPERTY_N)',
        example: 'PROPERTY_101',
        nullable: true,
        type: String,
    })
    fieldId!: string | null;

    @ApiProperty({ description: 'Есть в PortalDB', example: true })
    inDb!: boolean;

    @ApiProperty({
        description: 'FIELD_ID, сохранённый в PortalDB (bitrixCamelId)',
        example: 'PROPERTY_101',
        nullable: true,
        type: String,
    })
    dbFieldId!: string | null;

    @ApiProperty({ description: 'Bitrix и БД совпадают', example: true })
    inSync!: boolean;
}

/** Статус одного списка: эталон × Bitrix × БД. */
export class ListMonitorRowDto {
    @ApiProperty({
        description:
            'Папка шаблона-источника (listName для install-эндпоинтов)',
        enum: ListFolderEnum,
        example: ListFolderEnum.KPI,
    })
    sourceListName!: ListFolderEnum;

    @ApiProperty({
        description:
            'Группа папки шаблона-источника (group для install-эндпоинтов)',
        enum: ListGroupEnum,
        example: ListGroupEnum.SALES,
    })
    sourceGroup!: ListGroupEnum;

    @ApiProperty({ description: 'Тип списка', example: 'kpi' })
    type!: string;

    @ApiProperty({ description: 'Группа отдела', example: 'sales' })
    group!: string;

    @ApiProperty({ description: 'Код из шаблона', example: 'kpi' })
    code!: string;

    @ApiProperty({ description: 'Название', example: 'ОП KPI' })
    name!: string;

    @ApiProperty({ description: 'Есть в Bitrix', example: true })
    inBitrix!: boolean;

    @ApiProperty({
        description: 'IBLOCK_ID в Bitrix',
        example: 41,
        nullable: true,
        type: Number,
    })
    bitrixId!: number | null;

    @ApiProperty({ description: 'Есть в БД `bitrixlists`', example: true })
    inDb!: boolean;

    @ApiProperty({
        description: 'bitrixId в БД',
        example: 41,
        nullable: true,
        type: Number,
    })
    dbBitrixId!: number | null;

    @ApiProperty({ description: 'Bitrix и БД совпадают', example: true })
    inSync!: boolean;

    @ApiProperty({
        description: 'Статусы полей списка',
        type: [ListFieldMonitorRowDto],
    })
    fields!: ListFieldMonitorRowDto[];
}

/** Смерженное состояние списков на портале (Monitoring). */
export class ListMonitoringResponseDto {
    @ApiProperty({
        description: 'Домен портала',
        example: 'example.bitrix24.ru',
    })
    domain!: string;

    @ApiProperty({ description: 'ID портала', example: 3, type: Number })
    portalId!: number;

    @ApiProperty({
        description: 'Статусы списков со статусами полей',
        type: [ListMonitorRowDto],
    })
    lists!: ListMonitorRowDto[];
}
