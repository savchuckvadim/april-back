import { IsArray, IsObject } from "class-validator";
import { Type } from "class-transformer";
import { IsNumber , ValidateNested} from "class-validator";
import { IsBoolean } from "class-validator";
import { IsString } from "class-validator";
import { IsOptional } from "class-validator";
import { SupplyDto } from "../supply.dto";

export class SupplyFieldDto {
    @IsString() name: string;
    @IsString() code: string;
    @IsBoolean() isActive: boolean;
    @IsString() type: string;
    @IsNumber() order: number;
    @IsOptional() defaultValue: any;
    @IsOptional() value: any;
    @IsOptional() @ValidateNested() @Type(() => SupplyDto) supply?: SupplyDto;
}
class CellsGroupDto {
    @IsString() name: string;
    @IsArray() @ValidateNested({ each: true }) @Type(() => SupplyFieldDto) cells: SupplyFieldDto[];
    @IsOptional() @IsString() target?: string;
}

class OfferOptionsDto {
    @IsObject() year: any;
    @IsObject() price: any;
    @IsObject() discount: any;
    @IsObject() measure: any;
    @IsObject() supply: any;
}

class CellsWrapper {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CellsGroupDto)
    general: CellsGroupDto[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CellsGroupDto)
    alternative?: CellsGroupDto[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CellsGroupDto)
    total?: CellsGroupDto[];
}

export class PriceDto {
    @ValidateNested() @Type(() => CellsWrapper) cells: CellsWrapper;
    @IsObject() @ValidateNested() @Type(() => OfferOptionsDto) options: OfferOptionsDto;
    @IsBoolean() isDefaultShow: boolean;
    @IsBoolean() isTable: boolean;
    @IsBoolean() isOneMeasure: boolean;
    @IsBoolean() isDiscountShow: boolean;
    @IsBoolean() isSupplyLong: boolean;
    @IsOptional() @IsString() prepaymentStyle: string;
}
