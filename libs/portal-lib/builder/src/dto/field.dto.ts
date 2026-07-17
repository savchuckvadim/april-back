import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';
import { FieldModel } from '../mappers/pbx-field.mapper';
import { FieldItemDto } from './field-item.dto';

/** Пользовательское поле Битрикс (UF_CRM_*), как его отдавал Laravel BitrixFieldResource. */
export class FieldDto implements FieldModel {
    @ApiProperty({
        description: 'ID поля в нашей БД',
        example: 5,
        type: Number,
    })
    @IsNumber()
    id!: number;

    @ApiProperty({
        description: 'Тип поля Битрикс',
        example: 'enumeration',
        type: String,
    })
    @IsString()
    type!: string;

    @ApiProperty({
        description: 'Код поля для ассоциаций (совпадает с CODE в Битрикс)',
        example: 'sales_kpi_event_type',
        type: String,
    })
    @IsString()
    code!: string;

    @ApiProperty({
        description: 'Системное имя поля',
        example: 'event_type',
        type: String,
    })
    @IsString()
    name!: string;

    @ApiProperty({
        description: 'Отображаемое название поля',
        example: 'Тип события',
        type: String,
    })
    @IsString()
    title!: string;

    @ApiProperty({
        description: 'ID поля в Битрикс (UF_CRM_...)',
        example: 'UF_CRM_1712000000',
        type: String,
    })
    @IsString()
    bitrixId!: string;

    @ApiProperty({
        description: 'ID поля в Битрикс в camelCase (ufCrm...)',
        example: 'ufCrm1712000000',
        type: String,
    })
    @IsString()
    bitrixCamelId!: string;

    @ApiProperty({
        description: 'ID сущности-владельца поля',
        example: 3,
        type: Number,
    })
    @IsNumber()
    entity_id!: number;

    @ApiProperty({
        description:
            'Принадлежность поля к родительской модели (list, xo, calling и т.п.)',
        example: 'list',
        type: String,
    })
    @IsString()
    parent_type!: string;

    @ApiProperty({
        description:
            'Элементы списочного поля (дубль items — так отдавал Laravel)',
        type: [FieldItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FieldItemDto)
    bitrixfielditems!: FieldItemDto[];

    @ApiProperty({
        description: 'Элементы списочного поля',
        type: [FieldItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FieldItemDto)
    items!: FieldItemDto[];
}
