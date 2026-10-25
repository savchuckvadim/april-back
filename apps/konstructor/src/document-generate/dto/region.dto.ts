import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    ValidateNested,
    IsNumber,
    IsString,
    IsOptional,
} from 'class-validator';

export class RegionDto {
    @ApiProperty({
        description: 'Легаси-номер региона (0 — не используется)',
        type: Number,
    })
    @IsNumber()
    number: number;
    @ApiProperty({
        description: 'Ставка абонентского обслуживания',
        type: Number,
    })
    @IsNumber()
    abs: number;
    @ApiProperty({ description: 'Код региона', type: String })
    @IsString()
    name: string;
    @ApiProperty({ description: 'Название региона', type: String })
    @IsString()
    title: string;
    @ApiProperty({
        description:
            'Название регионального инфоблока — так регион печатается в договоре',
        type: String,
    })
    @IsString()
    infoblock: string;
    @ApiProperty({ description: 'ID региона', type: Number, required: false })
    @IsOptional()
    @IsNumber()
    id?: number;
}

export class RegionsDto {
    @ApiProperty({
        description: 'Регионы в составе комплекта',
        type: [RegionDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RegionDto)
    inComplect: RegionDto[];
    @ApiProperty({ description: 'Избранные регионы', type: [RegionDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RegionDto)
    favorite: RegionDto[];
    @ApiProperty({ description: 'Регионы без веса', type: [RegionDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RegionDto)
    noWidth: RegionDto[];
}
