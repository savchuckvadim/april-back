import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsIn,
    IsNumber,
    IsString,
    ValidateNested,
} from 'class-validator';
import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { StageDto } from './stage.dto';

/** Категория (воронка) сущности CRM, как её отдавал Laravel BtxCategoryResource. */
export class CategoryDto implements IPCategory {
    @ApiProperty({
        description: 'ID категории в нашей БД',
        example: 2,
        type: Number,
    })
    @IsNumber()
    id!: number;

    @ApiProperty({
        description: 'Тип категории',
        example: 'base',
        type: String,
    })
    @IsString()
    type!: string;

    @ApiProperty({
        description: 'Группа категории (sales, service и т.п.)',
        example: 'sales',
        type: String,
    })
    @IsString()
    group!: string;

    @ApiProperty({
        description: 'Системное имя категории',
        example: 'sales_base',
        type: String,
    })
    @IsString()
    name!: string;

    @ApiProperty({
        description: 'Отображаемое название категории',
        example: 'Продажи',
        type: String,
    })
    @IsString()
    title!: string;

    @ApiProperty({
        description: 'ID категории в Битрикс (числом в строке)',
        example: '34',
        type: String,
    })
    @IsString()
    bitrixId!: string;

    @ApiProperty({
        description: 'ID категории в Битрикс в camelCase',
        example: '34',
        type: String,
    })
    @IsString()
    bitrixCamelId!: string;

    @ApiProperty({
        description: 'Код категории для ассоциаций',
        example: 'sales_base',
        type: String,
    })
    @IsString()
    code!: string;

    @ApiProperty({
        description: 'Активна ли категория (0/1, как в Laravel)',
        enum: [0, 1],
    })
    @IsIn([0, 1])
    isActive!: number;

    @ApiProperty({
        description: 'ID сущности-владельца категории',
        example: 3,
        type: Number,
    })
    @IsNumber()
    entity_id!: number;

    @ApiProperty({
        description: 'Тип сущности-владельца (FQCN Laravel-модели)',
        example: 'App\\Models\\BtxDeal',
        type: String,
    })
    @IsString()
    entity_type!: string;

    @ApiProperty({
        description: 'Принадлежность категории к родительской модели',
        example: 'deal',
        type: String,
    })
    @IsString()
    parent_type!: string;

    @ApiProperty({ description: 'Стадии категории', type: [StageDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => StageDto)
    stages!: StageDto[];
}
