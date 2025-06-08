import { IsArray, IsObject } from "class-validator";
import { Type } from "class-transformer";
import { IsNumber , ValidateNested} from "class-validator";
import { IsBoolean } from "class-validator";
import { IsString } from "class-validator";
import { IsOptional } from "class-validator";
import { SupplyDto } from "../supply.dto";
import { ApiProperty } from "@nestjs/swagger";
export class SupplyFieldDto {
    @ApiProperty({ description: 'Name of the supply field' })
    @IsString() name: string;
    @ApiProperty({ description: 'Code of the supply field' })
    @IsString() code: string;
    @ApiProperty({ description: 'Is active of the supply field' })
    @IsBoolean() isActive: boolean;
    @ApiProperty({ description: 'Type of the supply field' })
    @IsString() type: string;
    @ApiProperty({ description: 'Order of the supply field' })
    @IsNumber() order: number;
    @ApiProperty({ description: 'Default value of the supply field' })
    @IsOptional() defaultValue: any;
    @ApiProperty({ description: 'Value of the supply field' })
    @IsOptional() value: any;
    @ApiProperty({ description: 'Supply of the supply field', type: SupplyDto })
    @IsOptional() @ValidateNested() @Type(() => SupplyDto) supply?: SupplyDto;
}
class CellsGroupDto {
    @ApiProperty({ description: 'Name of the cells group' })
    @IsString() name: string;
    @ApiProperty({ description: 'Cells of the cells group', type: [SupplyFieldDto] })
    @IsArray() @ValidateNested({ each: true }) @Type(() => SupplyFieldDto) cells: SupplyFieldDto[];
    @ApiProperty({ description: 'Target of the cells group' })
    @IsOptional() @IsString() target?: string;
}

class OfferOptionsDto {
    @ApiProperty({ description: 'Year of the offer options' })
    @IsObject() year: any;
    @ApiProperty({ description: 'Price of the offer options' })
    @IsObject() price: any;
    @ApiProperty({ description: 'Discount of the offer options' })
    @IsObject() discount: any;
    @ApiProperty({ description: 'Measure of the offer options' })
    @IsObject() measure: any;
    @ApiProperty({ description: 'Supply of the offer options', type: SupplyDto })
    @IsObject() supply: any;
}

class CellsWrapper {
    @ApiProperty({ description: 'General of the cells wrapper', type: [CellsGroupDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CellsGroupDto)
    general: CellsGroupDto[];

    @ApiProperty({ description: 'Alternative of the cells wrapper', type: [CellsGroupDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CellsGroupDto)
    alternative?: CellsGroupDto[];

    @ApiProperty({ description: 'Total of the cells wrapper', type: [CellsGroupDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CellsGroupDto)
    total?: CellsGroupDto[];
}

export class PriceDto {
    @ApiProperty({ description: 'Cells of the price', type: CellsWrapper })
    @ValidateNested() @Type(() => CellsWrapper) cells: CellsWrapper;
    
    @ApiProperty({ description: 'Options of the price', type: OfferOptionsDto })
    @IsObject() @ValidateNested() @Type(() => OfferOptionsDto) options: OfferOptionsDto;
   
    @ApiProperty({ description: 'Is default show of the price' })
    @IsBoolean() isDefaultShow: boolean;
    
    @ApiProperty({ description: 'Is table of the price' })
    @IsBoolean() isTable: boolean;
   
    @ApiProperty({ description: 'Is one measure of the price' })
    @IsBoolean() isOneMeasure: boolean;
   
    @ApiProperty({ description: 'Is discount show of the price' })
    @IsBoolean() isDiscountShow: boolean;
   
    @ApiProperty({ description: 'Is supply long of the price' })
    @IsBoolean() isSupplyLong: boolean;
    
    @ApiProperty({ description: 'Prepayment style of the price' })
    @IsOptional() @IsString() prepaymentStyle: string;
}
