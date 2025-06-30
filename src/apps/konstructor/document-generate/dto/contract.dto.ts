import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, ValidateNested } from "class-validator";
import { IsObject } from "class-validator";
import { IsString } from "class-validator";
import { IsNumber } from "class-validator";


class ContractMeasureDto {
    @ApiProperty({ description: 'ID of the measure' })
    @IsNumber() id: number;

    @ApiProperty({ description: 'Measure ID of the measure' })
    @IsNumber() measure_id: number;

    @ApiProperty({ description: 'Portal ID of the measure' })
    @IsNumber() portal_id: number;

    @ApiProperty({ description: 'Bitrix ID of the measure' })
    @IsString() bitrixId: string;

    @ApiProperty({ description: 'Name of the measure' })
    @IsString() name: string;

    @ApiProperty({ description: 'Short name of the measure' })
    @IsString() shortName: string;

    @ApiProperty({ description: 'Full name of the measure' })
    @IsString() fullName: string;

    @ApiProperty({ description: 'Created at of the measure' })
    @IsString() created_at: string;

    @ApiProperty({ description: 'Updated at of the measure' })
    @IsString() updated_at: string;

    @ApiProperty({ description: 'Measure of the measure', type: Object })
    @IsObject() measure: any;
}
export class ContracPortaltDto {
    @ApiProperty({ description: 'ID of the contract' })
    @IsNumber() id: number;

    @ApiProperty({ description: 'Name of the contract' })
    @IsString({ message: 'ContracPortaltDto name must be a string' })
    name: string;

    @ApiProperty({ description: 'Short name of the contract' })
    @IsString({ message: 'ContracPortaltDto shortName must be a string' })
    shortName: string;

    @ApiProperty({ description: 'Full name of the contract' })
    @IsString({ message: 'ContracPortaltDto fullName must be a string' })
    fullName: string;

    @ApiProperty({ description: 'Created at of the contract' })
    @IsString({ message: 'ContracPortaltDto created_at must be a string' })
    created_at: string;

    @ApiProperty({ description: 'Updated at of the contract' })
    @IsOptional()
    @IsString({ message: 'ContracPortaltDto updated_at must be a string' })
    updated_at: string | null;
}
export class ContractDto {
    @ApiProperty({ description: 'ID of the contract' })
    @IsNumber() id: number;

    @ApiProperty({ description: 'Contract of the contract', type: ContracPortaltDto })
    @IsObject({ message: 'contract must be a valid ContracPortaltDto' })
    contract: ContracPortaltDto;

    @ApiProperty({ description: 'Code of the contract' })
    @IsString({ message: 'code must be a string' }) 
    code: string;

    @ApiProperty({ description: 'Short name of the contract' })
    @IsString({ message: 'shortName must be a string' }) 
    shortName: string;

    @ApiProperty({ description: 'Number of the contract' })
    @IsNumber() number: number;

    @ApiProperty({ description: 'April name of the contract' })
    @IsString({ message: 'aprilName must be a string' }) 
    aprilName: string;

    @ApiProperty({ description: 'Bitrix name of the contract' })
    @IsString({ message: 'bitrixName must be a string' }) 
    bitrixName: string;

    @ApiProperty({ description: 'Discount of the contract' })
    @IsNumber() 
    discount: number;

    @ApiProperty({ description: 'Item ID of the contract' })
    @IsNumber() 
    itemId: number;

    @ApiProperty({ description: 'Prepayment of the contract' })
    @IsNumber() 
    prepayment: number;

    @ApiProperty({ description: 'Order of the contract' })
    @IsNumber() 
    order: number;

    @ApiProperty({ description: 'Portal measure of the contract', type: ContractMeasureDto })
    @ValidateNested({ message: 'portalMeasure must be a valid ContractMeasureDto' })
    @Type(() => ContractMeasureDto) 
    portalMeasure: ContractMeasureDto;

    @ApiProperty({ description: 'Measure code of the contract' })
    @IsNumber() 
    measureCode: number;

    @ApiProperty({ description: 'Measure full name of the contract' })
    @IsString({ message: 'measureFullName must be a string' }) 
    measureFullName: string;

    @ApiProperty({ description: 'Measure ID of the contract' })
    @IsNumber() 
    measureId: number;

    @ApiProperty({ description: 'Measure name of the contract' })
    @IsString({ message: 'measureName must be a string' }) 
    measureName: string;

    @ApiProperty({ description: 'Measure number of the contract' })
    @IsNumber() 
    measureNumber: number;
}
