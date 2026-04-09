import { IsBoolean, IsEnum } from 'class-validator';
import { IsNumber } from 'class-validator';
import { IsOptional } from 'class-validator';
import { IsString } from 'class-validator';
import { IsArray } from 'class-validator';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { INFOBLOCK_GROUP_TYPE } from './complect.type';

export class ComplectInfoblockValueDto {
    @ApiProperty({ description: 'Name of the complect value' })
    @IsString()
    name: string;
    @ApiProperty({ description: 'Title of the complect value' })
    @IsOptional()
    @IsString()
    title?: string;
    @ApiProperty({ description: 'Number of the complect value' })
    @IsOptional()
    @IsNumber()
    number?: number;
    @ApiProperty({ description: 'Code of the complect value' })
    @IsOptional()
    @IsString()
    code?: string;
    @ApiProperty({ description: 'Checked of the complect value' })
    @IsBoolean()
    checked: boolean;
    @ApiProperty({ description: 'Weight of the complect value' })
    @IsNumber()
    weight: number;
    @ApiProperty({ description: 'Description of the complect value' })
    @IsOptional()
    @IsString()
    description?: string | null;
    @ApiProperty({ description: 'Is LA of the complect value' })
    @IsOptional()
    @IsBoolean()
    isLa?: boolean;

    @ApiProperty({ description: 'Region of the complect value' })
    @IsBoolean()
    @IsOptional()
    isRegion?: boolean;
}

export class ComplectDto {
    @ApiProperty({ description: 'Name of the complect' })
    @IsString()
    groupsName: string;
    @ApiProperty({
        description: 'Value of the complect',
        type: [ComplectInfoblockValueDto],
    })
    @ApiProperty({
        description: 'Type of the complect',
        enum: INFOBLOCK_GROUP_TYPE,
    })
    @IsEnum(INFOBLOCK_GROUP_TYPE)
    type: INFOBLOCK_GROUP_TYPE;
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ComplectInfoblockValueDto)
    value: ComplectInfoblockValueDto[];
}
