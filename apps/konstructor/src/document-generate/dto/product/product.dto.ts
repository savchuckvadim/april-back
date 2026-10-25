import { IsBoolean, IsEnum, IsOptional, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { IsNumber } from 'class-validator';
import { IsString } from 'class-validator';
import { ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ContractDto } from '../../../dto/contract.dto';
import { SupplyDto } from '@app/konstructor/dto';

export enum ProductTypeEnum {
    garant = 'garant',
    lt = 'lt',
    lt_other = 'lt_other',
    consalting = 'consalting',
    star = 'star',
    academy = 'academy',
}

/** Справочный продукт строки (легаси ProductType): комплект × поставка × договор */
export class ProductDto {
    @ApiProperty({ description: 'Легаси-номер продукта', type: Number })
    @IsNumber()
    number: number;
    @ApiProperty({ type: String })
    @IsString()
    name: string;
    @ApiProperty({
        description: 'ID товара каталога Bitrix (bitrixItemId договора)',
        required: false,
        nullable: true,
        oneOf: [{ type: 'number' }, { type: 'string' }],
    })
    @IsOptional()
    productId: number | string | null;

    @ApiProperty({ description: 'Легаси-номер комплекта', type: Number })
    @IsNumber()
    complectNumber: number;
    @ApiProperty({ type: String })
    @IsString()
    complectName: string;
    @ApiProperty({ type: Boolean })
    @IsBoolean()
    withConsalting: boolean;
    @ApiProperty({ description: 'prof | universal', type: String })
    @IsString()
    complectType: string;
    @ApiProperty({ description: 'Цена по АБС (универсал)', type: Boolean })
    @IsBoolean()
    abs: boolean;
    @ApiProperty({ description: 'Легаси-номер поставки', type: Number })
    @IsNumber()
    supplyNumber: number;
    @ApiProperty({ type: String })
    @IsString()
    supplyName: string;
    @ApiProperty({ description: 'internet | proxima', type: String })
    @IsString()
    supplyType: string;
    @ApiProperty({ description: 'Подпись поставки для КП', type: String })
    @IsString()
    quantityForKp: string;
    @ApiProperty({ description: 'Множитель договора: 1 / 6 / 12 (24)', type: Number })
    @IsNumber()
    contractCoefficient: number;

    @ApiProperty({ type: ContractDto })
    @ValidateNested()
    @Type(() => ContractDto)
    contract: ContractDto;

    @ApiProperty({ type: SupplyDto, required: false, nullable: true })
    @IsOptional()
    @ValidateIf((o: ProductDto) => o.supply !== false)
    @ValidateNested()
    @Type(() => SupplyDto)
    supply: SupplyDto | false | null;

    @ApiProperty({ enum: ProductTypeEnum, enumName: 'ProductType' })
    @IsEnum(ProductTypeEnum)
    type: ProductTypeEnum;
}
