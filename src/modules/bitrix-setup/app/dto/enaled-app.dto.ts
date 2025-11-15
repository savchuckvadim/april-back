import { IsString, IsNotEmpty, ValidateNested, IsEnum, IsArray } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BITRIX_APP_CODES, BITRIX_APP_GROUPS, BITRIX_APP_STATUSES, BITRIX_APP_TYPES, VALID_APP_STATUSES, VALID_APP_TYPES } from '../enums/bitrix-app.enum';

export class EnabledAppPlacementDto {
    @ApiProperty({
        description: 'Type',
        example: BITRIX_APP_TYPES.KONSTRUCTOR,
        enum: BITRIX_APP_TYPES,
    })
    @IsEnum(BITRIX_APP_TYPES)
    type: BITRIX_APP_TYPES;

    @ApiProperty({
        description: 'Title',
        example: 'Конструктор Коммерческих Предложений',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description: 'Description',
        example: 'Встраиваемый виджет Конструктор Коммерческих Предложений',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    description: string;

    @ApiProperty({
        description: 'Value',
        example: 'Встраиваемый виджет Конструктор Коммерческих Предложений',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    value: string;
}
export class EnabledAppDto {
    @ApiProperty({
        description: 'Code',
        example: BITRIX_APP_CODES.SALES,
        enum: BITRIX_APP_CODES,
    })
    @IsEnum(BITRIX_APP_CODES)
    @IsNotEmpty()
    code: BITRIX_APP_CODES;

    @ApiProperty({
        description: 'Group',
        example: BITRIX_APP_GROUPS.SALES,
        enum: BITRIX_APP_GROUPS,
    })
    @IsEnum(BITRIX_APP_GROUPS)
    group: BITRIX_APP_GROUPS;

    @ApiProperty({
        description: 'Type',
        example: BITRIX_APP_TYPES.KONSTRUCTOR,
        enum: BITRIX_APP_TYPES,
    })
    @IsEnum(BITRIX_APP_TYPES)
    type: BITRIX_APP_TYPES;

    @ApiProperty({
        description: 'Placements',
        example: [
            {
                type: BITRIX_APP_TYPES.KONSTRUCTOR,
            }
        ],
        type: Array,
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => EnabledAppPlacementDto)
    placements: EnabledAppPlacementDto[];

}
