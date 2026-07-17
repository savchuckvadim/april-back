import { Type } from 'class-transformer';
import {
    IsArray,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Множественное поле контакта Bitrix (телефон / email).
 * Bitrix хранит такие поля массивом значений с типом.
 * Фронт может прислать запись без TYPE или VALUE — все поля опциональны.
 */
export class ContactMultifieldDto {
    @ApiPropertyOptional({
        description: 'Значение поля (номер телефона или адрес email).',
        type: String,
        example: '+79991234567',
    })
    @IsOptional()
    @IsString()
    VALUE?: string;

    @ApiPropertyOptional({
        description: 'Тип значения Bitrix (`WORK`, `MOBILE`, `HOME` и т.д.).',
        type: String,
        example: 'WORK',
    })
    @IsOptional()
    @IsString()
    TYPE?: string;
}

/**
 * Контакт события. У контакта с фронта может отсутствовать любое поле
 * (даже ID и имя) — DTO намеренно полностью опциональный.
 */
export class ContactDto {
    @ApiPropertyOptional({
        description: 'Идентификатор контакта Bitrix.',
        type: Number,
        example: 2048,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    ID?: number;

    @ApiPropertyOptional({
        description: 'Имя контакта.',
        type: String,
        example: 'Иван',
    })
    @IsOptional()
    @IsString()
    NAME?: string;

    @ApiPropertyOptional({
        description: 'Фамилия контакта.',
        type: String,
        example: 'Иванов',
    })
    @IsOptional()
    @IsString()
    LAST_NAME?: string;

    @ApiPropertyOptional({
        description: 'Отчество контакта.',
        type: String,
        example: 'Иванович',
    })
    @IsOptional()
    @IsString()
    SECOND_NAME?: string;

    @ApiPropertyOptional({
        description: 'Телефоны контакта — массив множественных полей Bitrix.',
        type: [ContactMultifieldDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ContactMultifieldDto)
    PHONE?: ContactMultifieldDto[];

    @ApiPropertyOptional({
        description: 'Email контакта — массив множественных полей Bitrix.',
        type: [ContactMultifieldDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ContactMultifieldDto)
    EMAIL?: ContactMultifieldDto[];

    @ApiPropertyOptional({
        description: 'Должность контакта.',
        type: String,
        example: 'Директор',
    })
    @IsOptional()
    @IsString()
    POST?: string;

    @ApiPropertyOptional({
        description: 'Комментарий по контакту.',
        type: String,
        example: 'Перезвонить после обеда',
    })
    @IsOptional()
    @IsString()
    COMMENTS?: string;

    @ApiPropertyOptional({
        description: 'Идентификатор компании, к которой привязан контакт.',
        type: String,
        example: '512',
    })
    @IsOptional()
    @IsString()
    COMPANY_ID?: string;

    @ApiPropertyOptional({
        description: 'Идентификатор ответственного за контакт сотрудника.',
        type: String,
        example: '81',
    })
    @IsOptional()
    @IsString()
    ASSIGNED_BY_ID?: string;
}
