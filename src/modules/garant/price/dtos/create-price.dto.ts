import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsNumber,
    IsOptional,
    IsBoolean,
    IsEnum,
} from 'class-validator';
import { PriceCreateType } from '../types/price-from-excel.type';
import { RegionType, SupplyTypeCode, SupplyType } from '../enums/price.enums';
import { ProfComplectCode } from '../../complect/install/type/install-complect.type';

export class CreatePriceDto implements PriceCreateType {
    @ApiProperty({
        description: 'Код цены',
        example: 'price-code-001',
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Тип региона: 0 - регионы, 1 - Москва',
        example: RegionType.REGIONS,
        enum: RegionType,
        enumName: 'RegionType',
    })
    @IsEnum(RegionType)
    region_type: RegionType;

    @ApiProperty({
        description: 'Значение цены',
        example: 1000.5,
    })
    @IsNumber()
    value: number;

    @ApiProperty({
        description: 'Специальная цена',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    isSpecial: boolean;

    @ApiProperty({
        description: 'Скидка',
        required: false,
        example: 10.5,
        type: Number,
    })
    @IsNumber()
    @IsOptional()
    discount: number | null;

    @ApiProperty({
        description: 'Код комплекта (будет найден Complect по code)',
        required: false,
        example: 'complect-code-001',
        enum: ProfComplectCode,
    })
    @IsEnum(ProfComplectCode)
    @IsOptional()
    complectCode: ProfComplectCode | null;

    @ApiProperty({
        description: 'Код типа поставки: 0 - internet, 1 - proxima',
        required: false,
        example: SupplyTypeCode.INTERNET,
        enum: SupplyTypeCode,
        enumName: 'SupplyTypeCode',
    })
    @IsEnum(SupplyTypeCode)
    @IsOptional()
    supplyTypeCode: '1' | '0' | null;

    @ApiProperty({
        description: 'Код поставки (1-18, будет найден Supply по code)',
        required: false,
        example: '1',
        type: String,
    })
    @IsString()
    @IsOptional()
    supplyCode: string | null;

    @ApiProperty({
        description: 'Тип поставки: internet | proxima',
        required: false,
        example: SupplyType.INTERNET,
        enum: SupplyType,
        enumName: 'SupplyType',
    })
    @IsEnum(SupplyType)
    @IsOptional()
    supplyType: 'internet' | 'proxima' | null;

    @ApiProperty({
        description: 'Код пакета Гарант (будет найден Package по code)',
        required: false,
        example: 'package-code-001',
        type: String,
    })
    @IsString()
    @IsOptional()
    garantPackageCode: string | null;
}
