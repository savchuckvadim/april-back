import { IsBoolean, IsEnum } from 'class-validator';
import { IsNumber } from 'class-validator';
import { IsOptional } from 'class-validator';
import { IsString } from 'class-validator';
import { IsArray } from 'class-validator';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { INFOBLOCK_GROUP_TYPE } from './complect.type';

/**
 * Инфоблок в группе наполнения документа (легаси-форма Infoblock с
 * `checked`). Явные `type`/`nullable` — иначе orval генерит `{[key]: unknown}`.
 */
export class ComplectInfoblockValueDto {
    @ApiProperty({ description: 'Название блока', type: String })
    @IsString()
    name: string;
    @ApiProperty({
        description: 'Заголовок для документа (регион — название инфоблока)',
        type: String,
        required: false,
    })
    @IsOptional()
    @IsString()
    title?: string;
    @ApiProperty({
        description: 'Легаси-номер блока',
        type: Number,
        required: false,
    })
    @IsOptional()
    @IsNumber()
    number?: number;
    @ApiProperty({
        description: 'Код блока (pbx/каталог)',
        type: String,
        required: false,
    })
    @IsOptional()
    @IsString()
    code?: string;
    @ApiProperty({ description: 'Блок выбран в наполнение', type: Boolean })
    @IsBoolean()
    checked: boolean;
    @ApiProperty({ description: 'Вес блока', type: Number })
    @IsNumber()
    weight: number;
    @ApiProperty({
        description: 'Описание блока для КП',
        type: String,
        required: false,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    description?: string | null;
    @ApiProperty({
        description: 'Судебная практика (онлайн-архив)',
        type: Boolean,
        required: false,
    })
    @IsOptional()
    @IsBoolean()
    isLa?: boolean;

    @ApiProperty({
        description: 'Региональный блок',
        type: Boolean,
        required: false,
    })
    @IsBoolean()
    @IsOptional()
    isRegion?: boolean;

    @ApiProperty({
        description: 'Подзаголовок (например, «N запросов в день» у Искры)',
        type: String,
        required: false,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    subtitle?: string | null | undefined;
}

/** Группа инфоблоков наполнения: НПА, судебная практика, ЭР, LT, бесплатные и т.д. */
export class ComplectDto {
    @ApiProperty({
        description: 'Название группы (легаси groupsName)',
        type: String,
    })
    @IsString()
    groupsName: string;
    @ApiProperty({
        description: 'Тип группы',
        enum: INFOBLOCK_GROUP_TYPE,
        enumName: 'InfoblockGroupType',
    })
    @IsEnum(INFOBLOCK_GROUP_TYPE)
    type: INFOBLOCK_GROUP_TYPE;
    @ApiProperty({
        description: 'Блоки группы',
        type: [ComplectInfoblockValueDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ComplectInfoblockValueDto)
    value: ComplectInfoblockValueDto[];
}
