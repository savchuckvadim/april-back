import { BitrixOwnerTypeId } from 'src/modules/bitrix/domain/enums/bitrix-constants.enum';
import { IBXSmartType } from '../interface/smart-type.interface';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsIn,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

const YN_VALUES = ['Y', 'N'] as const;
type YN = (typeof YN_VALUES)[number];

// Интерфейс для одной связи relation
export interface IBXSmartTypeRelation {
    entityTypeId: BitrixOwnerTypeId; // Идентификатор системного или пользовательского типа сущности CRM
    isChildrenListEnabled?: YN; // Добавлять ли связанный элемент в карточку ("Y" | "N")
}

// Интерфейс для связей relations
export interface IBXSmartTypeRelations {
    parent?: IBXSmartTypeRelation[]; // Элементы CRM, которые будут привязаны к данному смарт-процессу
    child?: IBXSmartTypeRelation[]; // Элементы CRM, к котором будет привязан данный смарт-процесс
}

// Интерфейс для привязки к пользовательским полям
export interface IBXSmartTypeLinkedUserFields {
    [key: string]: string; // Динамические ключи типа "CALENDAR_EVENT|UF_CRM_CAL_EVENT": "true"
}

// Интерфейс для полей смарт-процесса
export interface IBXSmartTypeFields {
    // Обязательные поля
    title: string; // Название смарт-процесса *

    // Опциональные поля
    entityTypeId?: number; // Идентификатор создаваемого смарт-процесса
    relations?: IBXSmartTypeRelations; // Объект, содержащий связи к другим сущностям CRM

    // Флаги включения функций (используют "Y" | "N" как в API)
    isUseInUserfieldEnabled?: YN; // Включено ли использование смарт-процесса в пользовательском поле
    linkedUserFields?: IBXSmartTypeLinkedUserFields; // Набор пользовательских полей
    isAutomationEnabled?: YN; // Включены ли роботы и триггеры
    isBeginCloseDatesEnabled?: YN; // Включены ли поля Дата начала и Дата завершения
    isBizProcEnabled?: YN; // Включено ли использование дизайнера бизнес процессов
    isCategoriesEnabled?: YN; // Включены ли свои воронки и туннели продаж
    isClientEnabled?: YN; // Включено ли поле Клиент
    isDocumentsEnabled?: YN; // Включена ли печать документов
    isLinkWithProductsEnabled?: YN; // Включена ли привязка товаров каталога
    isMycompanyEnabled?: YN; // Включено ли поле Реквизиты вашей компании
    isObserversEnabled?: YN; // Включено ли поле Наблюдатели
    isRecyclebinEnabled?: YN; // Включено ли использование корзины
    isSetOpenPermissions?: YN; // Делать ли новые воронки доступными для всех
    isSourceEnabled?: YN; // Включены ли поля Источник и Дополнительно об источнике
    isStagesEnabled?: YN; // Включено ли использование своих стадий и канбана

    // Устаревшие поля (для обратной совместимости)
    isExternal?: YN; // Является ли смарт-процесс вынесенным из CRM
    customSectionId?: number; // Идентификатор цифрового рабочего места
    customSections?: any[]; // Массив цифровых рабочих мест
}

export class SmartTypeRelationDto implements IBXSmartTypeRelation {
    @ApiProperty({
        description:
            'Идентификатор системного или пользовательского типа сущности CRM',
        example: BitrixOwnerTypeId.DEAL,
    })
    @IsNumber()
    entityTypeId: BitrixOwnerTypeId;

    @ApiPropertyOptional({
        enum: YN_VALUES,
        description: 'Добавлять ли связанный элемент в карточку',
    })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isChildrenListEnabled?: YN;
}

export class SmartTypeRelationsDto implements IBXSmartTypeRelations {
    @ApiPropertyOptional({
        type: [SmartTypeRelationDto],
        description:
            'Элементы CRM, которые будут привязаны к данному смарт-процессу',
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SmartTypeRelationDto)
    parent?: SmartTypeRelationDto[];

    @ApiPropertyOptional({
        type: [SmartTypeRelationDto],
        description: 'Элементы CRM, к которым будет привязан смарт-процесс',
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SmartTypeRelationDto)
    child?: SmartTypeRelationDto[];
}

export class SmartTypeFieldsDto implements IBXSmartTypeFields {
    @ApiProperty({
        description: 'Название смарт-процесса',
        example: 'Коммерческое предложение',
    })
    @IsString()
    title: string;

    @ApiPropertyOptional({ description: 'Идентификатор смарт-процесса' })
    @IsOptional()
    @IsNumber()
    entityTypeId?: number;

    @ApiPropertyOptional({ type: SmartTypeRelationsDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => SmartTypeRelationsDto)
    relations?: SmartTypeRelationsDto;

    @ApiPropertyOptional({
        description:
            'Набор пользовательских полей (пример: {"CALENDAR_EVENT|UF_CRM_CAL_EVENT":"true"})',
    })
    @IsOptional()
    @IsObject()
    linkedUserFields?: IBXSmartTypeLinkedUserFields;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isUseInUserfieldEnabled?: YN;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isAutomationEnabled?: YN;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isBeginCloseDatesEnabled?: YN;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isBizProcEnabled?: YN;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isCategoriesEnabled?: YN;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isClientEnabled?: YN;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isDocumentsEnabled?: YN;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isLinkWithProductsEnabled?: YN;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isMycompanyEnabled?: YN;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isObserversEnabled?: YN;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isRecyclebinEnabled?: YN;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isSetOpenPermissions?: YN;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isSourceEnabled?: YN;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isStagesEnabled?: YN;

    @ApiPropertyOptional({ enum: YN_VALUES })
    @IsOptional()
    @IsString()
    @IsIn(YN_VALUES)
    isExternal?: YN;

    @ApiPropertyOptional({
        description: 'Идентификатор цифрового рабочего места',
    })
    @IsOptional()
    @IsNumber()
    customSectionId?: number;

    @ApiPropertyOptional({ description: 'Массив цифровых рабочих мест' })
    @IsOptional()
    @IsArray()
    customSections?: unknown[];
}

// Основной DTO для добавления смарт-процесса
export class SmartTypeAddRequestDto {
    @ApiProperty({ type: SmartTypeFieldsDto })
    @ValidateNested()
    @Type(() => SmartTypeFieldsDto)
    fields: SmartTypeFieldsDto;
}

export class SmartTypeResponseDto {
    type: IBXSmartType;
}
export class SmartTypeListResponseDto {
    types: IBXSmartType[];
}
export class SmartTypeUpdateRequestDto extends SmartTypeAddRequestDto {
    @ApiProperty({ example: 123 })
    @IsNumber()
    id: number;
}
