import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsBoolean, IsOptional, IsArray } from 'class-validator';

export class CreateComplectDto {
    @ApiProperty({
        description: 'Название комплекта',
        example: 'Гарант Бухгалтер'
    })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'Полное название комплекта',
        example: 'Гарант Бухгалтер'
    })
    @IsString()
    fullName: string;

    @ApiProperty({
        description: 'Короткое название комплекта',
        example: 'Бухгалтер'
    })
    @IsString()
    shortName: string;

    @ApiProperty({
        description: 'Описание комплекта',
        required: false,
        example: 'для Бухгалтера'
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({
        description: 'Код комплекта',
        example: 'buh'
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Тип комплекта',
        example: 'prof',
        enum: ['prof', 'universal',]
    })
    @IsString()
    type: string;

    @ApiProperty({
        description: 'Цвет комплекта',
        required: false,
        example: '#FF0000'
    })
    @IsString()
    @IsOptional()
    color?: string;

    @ApiProperty({
        description: 'Вес комплекта',
        example: 3.5
    })
    @IsNumber()
    weight: number;

    @ApiProperty({
        description: 'ABS комплекта',
        example: '1.5',
        required: false
    })
    @IsString()
    @IsOptional()
    abs?: string;

    @ApiProperty({
        description: 'Номер комплекта',
        example: 1
    })
    @IsNumber()
    number: number;

    @ApiProperty({
        description: 'Тип продукта',
        example: 'garant',
        enum: ['garant', 'lt', 'star', 'consalting']
    })
    @IsString()
    productType: string;

    @ApiProperty({
        description: 'Наличие ABS',
        example: false
    })
    @IsBoolean()
    withABS: boolean;

    @ApiProperty({
        description: 'Наличие консалтинга',
        example: false
    })
    @IsBoolean()
    withConsalting: boolean;

    @ApiProperty({
        description: 'Наличие сервисов',
        example: true
    })
    @IsBoolean()
    withServices: boolean;

    @ApiProperty({
        description: 'Наличие LT',
        example: false
    })
    @IsBoolean()
    withLt: boolean;

    @ApiProperty({
        description: 'Изменяемый комплект',
        example: true
    })
    @IsBoolean()
    isChanging: boolean;

    @ApiProperty({
        description: 'Есть ли наполнение по умолчанию',
        example: false
    })
    @IsBoolean()
    withDefault: boolean;

    @ApiProperty({
        description: 'Список ID инфоблоков, входящих в комплект',
        type: [String],
        isArray: true,
        example: ['1', '2', '3']
    })
    @IsArray()
    @IsString({ each: true })
    infoblockIds: string[];
} 