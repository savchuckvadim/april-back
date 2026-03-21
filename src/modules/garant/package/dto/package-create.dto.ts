import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsNumber,
    IsBoolean,
    IsOptional,
    IsEnum,
} from 'class-validator';
import { PackageProductTypeEnum, PackageTypeEnum } from '../types/package.type';

export class PackageCreateDto {
    @ApiProperty({
        description: 'Название пакета',
        example: 'Гарант Пакет',
        type: String,
    })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'Полное название пакета',
        example: 'Гарант Пакет',
        type: String,
    })
    @IsString()
    fullName: string;

    @ApiProperty({
        description: 'Короткое название пакета',
        example: 'Пакет',
        type: String,
    })
    @IsString()
    shortName: string;

    @ApiProperty({
        description: 'Описание пакета',
        required: false,
        example: 'Описание пакета',
        type: String,
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({
        description: 'Код пакета',
        example: 'package',
        type: String,
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Тип пакета по сути значит как будет высчитываться цена',
        example: PackageTypeEnum.PROF,
        enum: PackageTypeEnum,
        enumName: 'PackageTypeEnum',
    })
    @IsEnum(PackageTypeEnum)
    type: string;

    @ApiProperty({
        description: 'Цвет пакета',
        required: false,
        example: '#FF0000',
        type: String,
    })
    @IsString()
    @IsOptional()
    color?: string;

    @ApiProperty({
        description: 'Вес пакета',
        example: 3.5,
        required: false,
        type: Number,
    })
    @IsNumber()
    @IsOptional()
    weight?: number;

    @ApiProperty({
        description: 'ABS пакета',
        example: 1.5,
        required: false,
        type: Number,
    })
    @IsNumber()
    @IsOptional()
    abs?: number;

    @ApiProperty({
        description: 'Номер пакета',
        example: 1,
        type: Number,
    })
    @IsNumber()
    number: number;

    @ApiProperty({
        description: 'Тип продукта',
        example: PackageProductTypeEnum.GARANT,
        enum: PackageProductTypeEnum,
        required: false,
        enumName: 'PackageProductTypeEnum',
    })
    @IsEnum(PackageProductTypeEnum)
    @IsOptional()
    productType?: string;

    @ApiProperty({
        description: 'Наличие ABS',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    withABS: boolean;

    @ApiProperty({
        description: 'Изменяемый пакет',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    isChanging: boolean;

    @ApiProperty({
        description: 'Есть ли наполнение по умолчанию',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    withDefault: boolean;

    @ApiProperty({
        description: 'ID инфоблока',
        type: String,
        required: false,
        example: '1',
    })
    @IsString()
    @IsOptional()
    infoblock_id?: string | null;

    @ApiProperty({
        description: 'ID группы инфоблоков',
        type: String,
        required: false,
        example: '1',
    })
    @IsString()
    @IsOptional()
    info_group_id?: string | null;
}
