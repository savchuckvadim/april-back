import { IsBoolean, IsEnum, IsOptional, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { IsNumber } from 'class-validator';
import { IsString } from 'class-validator';
import { ValidateNested } from 'class-validator';
import { ContractDto } from '../../../dto/contract.dto';
import { SupplyDto } from '@/apps/konstructor/dto';

export enum ProductTypeEnum {
    garant = 'garant',
    lt = 'lt',
    lt_other = 'lt_other',
    consalting = 'consalting',
    star = 'star',
    academy = 'academy',
}

export class ProductDto {
    @IsNumber() number: number;
    @IsString() name: string;
    @IsOptional() productId: any;

    @IsNumber() complectNumber: number;
    @IsString() complectName: string;
    @IsBoolean() withConsalting: boolean;
    @IsString() complectType: string;
    @IsBoolean() abs: boolean;
    @IsNumber() supplyNumber: number;
    @IsString() supplyName: string;
    @IsString() supplyType: string;
    @IsString() quantityForKp: string;
    @IsNumber() contractCoefficient: 1 | 6 | 12;

    @ValidateNested()
    @Type(() => ContractDto)
    contract: ContractDto;

    @IsOptional()
    @ValidateIf((o: ProductDto) => o.supply !== false)
    @ValidateNested()
    @Type(() => SupplyDto)
    supply: SupplyDto | false | null;

    @IsEnum(ProductTypeEnum) type: ProductTypeEnum;
    // остальные поля по аналогии (можно расширить)
}
