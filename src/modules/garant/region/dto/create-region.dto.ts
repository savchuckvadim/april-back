import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateRegionDto {
    @ApiProperty({
        description: 'Номер региона',
        example: 1
    })
    @IsNumber()
    number: number;

    @ApiProperty({
        description: 'Название региона',
        example: 'Москва'
    })
    @IsString()
    title: string;

    @ApiProperty({
        description: 'Код региона',
        example: 'MSK'
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Инфоблок региона',
        example: 'region-moscow'
    })
    @IsString()
    infoblock: string;

    @ApiProperty({
        description: 'ABS региона',
        example: 1000.50
    })
    @IsNumber()
    abs: number;

    @ApiProperty({
        description: 'Налог региона',
        example: 20.5
    })
    @IsNumber()
    tax: number;

    @ApiProperty({
        description: 'Налог ABS региона',
        example: 200.50
    })
    @IsNumber()
    tax_abs: number;
} 