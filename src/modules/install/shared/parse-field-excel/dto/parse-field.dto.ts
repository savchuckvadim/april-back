import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { Field, FieldType, ListItem } from '../type/parse-field.type';

/**
 * Допустимые runtime-значения для {@link FieldType}.
 * Используются и для swagger-документации (`enum`), и для рантайм-валидации (`@IsIn`).
 */
export const FIELD_TYPE_VALUES = [
    'string',
    'integer',
    'boolean',
    'date',
    'datetime',
    'enumeration',
    'multiple',
    'money',
    'crm',
    'employee',
] as const satisfies readonly FieldType[];

export class ListItemDto implements ListItem {
    @ApiProperty({
        description: 'Отображаемое название значения списка (label)',
        example: 'В работе',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    VALUE: string;

    @ApiProperty({
        description:
            'Флаг удаления элемента списка в Bitrix. ' +
            '"Y" — элемент помечен на удаление, "N" — активный элемент.',
        example: 'N',
        enum: ['Y', 'N'],
    })
    @IsString()
    @IsIn(['Y', 'N'])
    DEL: string;

    @ApiProperty({
        description:
            'XML_ID элемента списка в Bitrix. Используется как стабильный ' +
            'внешний идентификатор при синхронизации значений.',
        example: 'op_status_in_progress',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    XML_ID: string;

    @ApiProperty({
        description:
            'Внутренний код значения списка в приложении April. ' +
            'Обычно совпадает с XML_ID, но используется на стороне backend для маппинга.',
        example: 'op_status_in_progress',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    CODE: string;

    @ApiProperty({
        description:
            'Порядок сортировки значения внутри списка. ' +
            'Целое неотрицательное число, шаг 10 по соглашению.',
        example: 10,
        type: Number,
        minimum: 0,
    })
    @IsInt()
    @Min(0)
    SORT: number;
}

export class InstallEntityFieldDto implements Field {
    @ApiProperty({
        description:
            'Человекочитаемое название поля. ' +
            'Берётся из колонки "Название" Excel-файла установки.',
        example: 'ОП Статус Работы',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description:
            'Тип приложения, к которому относится поле. ' +
            'Определяет, в какую группу настроек попадёт поле при установке.',
        example: 'event-sales',
        enum: ['event-sales', 'konstructor'],
    })
    @IsString()
    @IsNotEmpty()
    appType: string;

    @ApiProperty({
        description:
            'Тип поля Bitrix. Соответствует одному из значений ' +
            '`PbxSalesEventFieldType | PbxSalesKonstructorFieldType`. ' +
            'Определяет, как поле будет создано в портале (UF_*).',
        example: 'enumeration',
        enum: FIELD_TYPE_VALUES,
    })
    @IsString()
    @IsIn(FIELD_TYPE_VALUES as unknown as string[])
    type: FieldType;

    @ApiProperty({
        description:
            'Список значений для поля типа `enumeration` / `multiple`. ' +
            'Для скалярных типов (string, integer, date, …) допускается пустой массив или отсутствие поля.',
        type: [ListItemDto],
        required: false,
        default: [],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ListItemDto)
    list: ListItem[];

    @ApiProperty({
        description:
            'Внутренний код поля в приложении April. ' +
            'Используется как стабильный ключ для поиска поля независимо от его UF_*-имени в Bitrix.',
        example: 'op_work_status',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description:
            'Имя поля на стороне Bitrix (как правило UF_CRM_<...>). ' +
            'Заполняется после фактического создания UF в портале; ' +
            'на входе установки может быть пустой строкой.',
        example: 'UF_CRM_OP_WORK_STATUS',
        type: String,
        default: '',
    })
    @IsString()
    bxFieldName: string;

    @ApiProperty({
        description:
            'Порядок сортировки поля в карточке Bitrix. ' +
            'Целое неотрицательное число, шаг 10 по соглашению.',
        example: 230,
        type: Number,
        minimum: 0,
    })
    @IsInt()
    @Min(0)
    order: number;

    @ApiProperty({
        description:
            'Признак того, что поле требует обновления при повторной установке. ' +
            '`true` — переустанавливать/синхронизировать, `false` — пропускать.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    isNeedUpdate: boolean;

    @ApiProperty({
        description:
            'Является ли поле множественным (MULTIPLE = Y в Bitrix). ' +
            'Не путать с `type === "multiple"` — это отдельный аспект, ' +
            'применимый к любому базовому типу.',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    isMultiple: boolean;
}

/**
 * Тонкая обёртка для эндпоинтов, принимающих массив полей одним телом запроса.
 * Удобно для bulk-установки и для типизации в Swagger.
 */
export class InstallEntityFieldsBulkDto {
    @ApiProperty({
        description: 'Массив полей для установки в Bitrix (bulk-операция).',
        type: [InstallEntityFieldDto],
    })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => InstallEntityFieldDto)
    fields!: InstallEntityFieldDto[];
}
