import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { Category, Stage } from '@/modules/pbx-install/shared';

/**
 * DTO одной воронки (категории) сделки, распаршенной из Excel-файла установки.
 * Используется как элемент {@link EntityParseCategoryDataDto.categories} и
 * описывает форму данных, которую возвращает
 * `ParseCategoryService.getParsedData`.
 */
export class StageDto implements Stage {
    @ApiProperty({
        description:
            'Идентификатор стадии из Excel-файла установки. ' +
            'Уникален в пределах книги и используется для связи со стадиями.',
        example: 's-001',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    id: string;

    @ApiProperty({
        description:
            'entityTypeId стадии в Bitrix CRM (для сделок и смарт-процессов). ' +
            'Наследуется от родительской категории.',
        example: '2',
        type: String,
    })
    @IsString()
    entityTypeId: string;

    @ApiProperty({
        description:
            'Тип сущности Bitrix, к которой относится стадия (например, `deal`).',
        example: 'deal',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    entityType: string;

    @ApiProperty({
        description:
            'Код приложения-владельца стадии (parentType из Excel). ' +
            'Например, `service` для отдела сервиса.',
        example: 'service',
        type: String,
    })
    @IsString()
    parentType: string;

    @ApiProperty({
        description:
            'Семантика стадии Bitrix: `P` — основная (in progress), ' +
            '`S` — успешная (success), `F` — провальная (failure).',
        example: 'P',
        enum: ['P', 'S', 'F'],
    })
    @IsString()
    @IsIn(['P', 'S', 'F'])
    type: string;

    @ApiProperty({
        description:
            'Группа отдела, к которой относится стадия (`sales` или `service`). ' +
            'Наследуется от родительской категории.',
        example: 'service',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    group: string;

    @ApiProperty({
        description: 'Отображаемое название стадии в карточке Bitrix.',
        example: 'В работе',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description:
            'Заголовок стадии. По соглашению дублирует `name` для совместимости ' +
            'с местами, где используется `title`.',
        example: 'В работе',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description:
            'STATUS_ID стадии в Bitrix (например, `NEW`, `SUPPLY`). ' +
            'Используется как стабильный идентификатор стадии в портале.',
        example: 'NEW',
        type: String,
    })
    @IsString()
    bitrixId: string;

    @ApiProperty({
        description:
            'Признак активности стадии. `true` — стадия используется при установке, ' +
            '`false` — пропускается.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    isActive: boolean;

    @ApiProperty({
        description:
            'STATUS_ID стадии для смарт-процесса (если стадия дублируется в смарте). ' +
            'Пустая строка для базовых сделок.',
        example: '',
        type: String,
        default: '',
    })
    @IsString()
    smartBitrixId: string;

    @ApiProperty({
        description:
            'HEX-код цвета стадии в карточке Bitrix (вместе с `#`).',
        example: '#39A8EF',
        type: String,
    })
    @IsString()
    color: string;

    @ApiProperty({
        description:
            'Внутренний код стадии в приложении April. ' +
            'Используется как стабильный ключ для маппинга на стадии Bitrix.',
        example: 'service_new',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description:
            'Признак того, что стадия требует обновления при повторной установке. ' +
            '`true` — переустанавливать/синхронизировать, `false` — пропускать.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    isNeedUpdate: boolean;

    @ApiProperty({
        description:
            'Порядок сортировки стадии в воронке. Целое неотрицательное число.',
        example: 10,
        type: Number,
        minimum: 0,
    })
    @IsInt()
    @Min(0)
    order: number;

    @ApiProperty({
        description:
            'ENTITY_ID стадии в Bitrix CRM. Заполняется в процессе установки, ' +
            'на входе обычно пустая строка.',
        example: '',
        type: String,
        default: '',
    })
    @IsString()
    bitrixEnitiyId: string;

    @ApiProperty({
        description:
            'Является ли стадия дефолтной для своей категории. ' +
            '`Y` — дефолтная, `N` — нет.',
        example: 'N',
        enum: ['Y', 'N'],
    })
    @IsString()
    @IsIn(['Y', 'N'])
    isDefault: 'Y' | 'N';
}

/**
 * DTO одной категории (воронки) сделки с вложенным списком стадий.
 * Описывает форму элемента {@link EntityParseCategoryDataDto.categories}.
 */
export class CategoryDto implements Category {
    @ApiProperty({
        description:
            'Идентификатор категории из Excel-файла установки. ' +
            'Уникален в пределах книги и используется для связи со стадиями.',
        example: 'c-001',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    id: string;

    @ApiProperty({
        description:
            'entityTypeId категории в Bitrix CRM. ' +
            'Для базовой сделки — `2`, для смарт-процессов — динамический.',
        example: '2',
        type: String,
    })
    @IsString()
    entityTypeId: string;

    @ApiProperty({
        description:
            'Тип сущности Bitrix, к которой относится категория (например, `deal`).',
        example: 'deal',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    entityType: string;

    @ApiProperty({
        description:
            'Тип воронки в схеме установки (например, `base` для базовой воронки).',
        example: 'base',
        type: String,
    })
    @IsString()
    type: string;

    @ApiProperty({
        description:
            'Группа отдела, к которой относится категория. ' +
            'Совпадает со значением `:group` в URL эндпоинта.',
        example: 'service',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    group: string;

    @ApiProperty({
        description: 'Отображаемое название категории (воронки) в Bitrix.',
        example: 'Сервис',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description:
            'Заголовок категории. По соглашению дублирует `name` для совместимости ' +
            'с местами, где используется `title`.',
        example: 'Сервис',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description:
            'CATEGORY_ID воронки в Bitrix CRM. ' +
            'На этапе парсинга Excel заполняется пустой строкой и проставляется при установке.',
        example: '',
        type: String,
        default: '',
    })
    @IsString()
    bitrixId: string;

    @ApiProperty({
        description:
            'CamelCase-представление `bitrixId` для маппинга на ключи запросов Bitrix. ' +
            'На этапе парсинга пустая строка.',
        example: '',
        type: String,
        default: '',
    })
    @IsString()
    bitrixCamelId: string;

    @ApiProperty({
        description:
            'Внутренний код категории в приложении April ' +
            '(одно из значений `ParseCategoryNameEnum`).',
        example: 'service_base',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description:
            'Признак активности категории. `true` — используется при установке, ' +
            '`false` — пропускается.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    isActive: boolean;

    @ApiProperty({
        description:
            'Признак того, что категория требует обновления при повторной установке.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    isNeedUpdate: boolean;

    @ApiProperty({
        description:
            'Порядок сортировки категории в списке воронок. Целое неотрицательное число.',
        example: 10,
        type: Number,
        minimum: 0,
    })
    @IsInt()
    @Min(0)
    order: number;

    @ApiProperty({
        description:
            'Является ли категория дефолтной для соответствующего entityType. ' +
            '`true` — дефолтная воронка.',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    isDefault: boolean;

    @ApiProperty({
        description:
            'Стадии, входящие в категорию. ' +
            'Для каждой категории отфильтрованы по `categoryId` в Excel-файле.',
        type: [StageDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => StageDto)
    stages: Stage[];
}

/**
 * Ответ эндпоинта парсинга категорий (воронок) сделки из Excel-файла установки.
 * Зеркало `EntityParseData`, который возвращает `ParseCategoryService.getParsedData`.
 */
export class EntityParseCategoryDataDto {
    @ApiProperty({
        description:
            'Количество распарсенных категорий после фильтрации по `categoryName`. ' +
            'Равно `categories.length` и продублировано для удобства клиентов.',
        example: 1,
        type: Number,
        minimum: 0,
    })
    @IsInt()
    @Min(0)
    count: number;

    @ApiProperty({
        description:
            'Категории (воронки) сделки с вложенными стадиями. ' +
            'Если в URL передан конкретный `categoryName`, массив содержит максимум один элемент; ' +
            'для `all` — все категории, найденные в Excel.',
        type: [CategoryDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CategoryDto)
    categories: CategoryDto[];
}
