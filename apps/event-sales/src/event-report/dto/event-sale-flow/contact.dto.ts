import { Type } from 'class-transformer';
import {
    IsArray,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Множественное поле контакта Bitrix (телефон / email).
 * Bitrix хранит такие поля массивом значений с типом.
 */
export class ContactMultifieldDto {
    @ApiProperty({
        description: 'Значение поля (номер телефона или адрес email).',
        type: String,
        example: '+79991234567',
    })
    @IsString()
    VALUE: string;

    @ApiProperty({
        description: 'Тип значения Bitrix (`WORK`, `MOBILE`, `HOME` и т.д.).',
        type: String,
        example: 'WORK',
    })
    @IsString()
    TYPE: string;
}

export class ContactDto {
    @ApiProperty({
        description: 'Идентификатор контакта Bitrix.',
        type: Number,
        example: 2048,
    })
    @IsNumber()
    @Type(() => Number)
    ID: number;

    @ApiProperty({
        description: 'Имя контакта.',
        type: String,
        example: 'Иван',
    })
    @IsString()
    NAME: string;

    @ApiPropertyOptional({
        description: 'Фамилия контакта.',
        type: String,
        example: 'Иванов',
    })
    @IsString()
    @IsOptional()
    LAST_NAME?: string;

    @ApiPropertyOptional({
        description: 'Отчество контакта.',
        type: String,
        example: 'Иванович',
    })
    @IsString()
    @IsOptional()
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
    @IsString()
    @IsOptional()
    POST?: string;

    @ApiPropertyOptional({
        description: 'Комментарий по контакту.',
        type: String,
        example: 'Перезвонить после обеда',
    })
    @IsString()
    @IsOptional()
    COMMENTS?: string;

    @ApiPropertyOptional({
        description: 'Идентификатор компании, к которой привязан контакт.',
        type: String,
        example: '512',
    })
    @IsString()
    @IsOptional()
    COMPANY_ID?: string;

    @ApiPropertyOptional({
        description: 'Идентификатор ответственного за контакт сотрудника.',
        type: String,
        example: '81',
    })
    @IsString()
    @IsOptional()
    ASSIGNED_BY_ID?: string;
}
