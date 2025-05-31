import { IsBoolean, IsEnum, IsOptional, ValidateIf } from "class-validator";
import { Type } from "class-transformer";
import { IsNumber } from "class-validator";
import { IsString } from "class-validator";
import { ValidateNested } from "class-validator";
import { SupplyDto } from "src/modules/document/supply-report/dto/supply.dto";
import { ContractDto } from "../contract.dto";

export enum ProductTypeEnum {
    garant = "garant",
    lt = "lt",
    consalting = "consalting",
    star = "star"
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

    @ValidateIf((o) => o.supply !== false)
    @ValidateNested()
    @Type(() => SupplyDto)
    supply: SupplyDto | false;

    @IsEnum(ProductTypeEnum) type: ProductTypeEnum;
    // остальные поля по аналогии (можно расширить)
}