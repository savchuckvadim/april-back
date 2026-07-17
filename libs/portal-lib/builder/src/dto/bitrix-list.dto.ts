import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';
import { BitrixListModel } from '../mappers/pbx-entity.mapper';
import { FieldDto } from './field.dto';

/** Универсальный список Битрикс, как его отдавал Laravel BitrixlistResource. */
export class BitrixListDto implements BitrixListModel {
    @ApiProperty({
        description: 'ID списка в нашей БД',
        example: 6,
        type: Number,
    })
    @IsNumber()
    id!: number;

    @ApiProperty({
        description: 'Тип списка (kpi, history, presentation)',
        example: 'kpi',
        type: String,
    })
    @IsString()
    type!: string;

    @ApiProperty({
        description: 'Группа списка (sales, service и т.п.)',
        example: 'sales',
        type: String,
    })
    @IsString()
    group!: string;

    @ApiProperty({
        description: 'Системное имя списка',
        example: 'sales_kpi',
        type: String,
    })
    @IsString()
    name!: string;

    @ApiProperty({
        description: 'Отображаемое название списка',
        example: 'KPI Продажи',
        type: String,
    })
    @IsString()
    title!: string;

    @ApiProperty({
        description: 'ID списка (инфоблока) в Битрикс',
        example: 41,
        type: Number,
    })
    @IsNumber()
    bitrixId!: number;

    @ApiProperty({
        description: 'ID портала в нашей БД',
        example: 1,
        type: Number,
    })
    @IsNumber()
    portal_id!: number;

    @ApiProperty({
        description: 'Поля списка (только parent_type=list, как в Laravel)',
        type: [FieldDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FieldDto)
    bitrixfields!: FieldDto[];
}
