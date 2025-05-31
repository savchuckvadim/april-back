import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";
import { IsObject } from "class-validator";
import { IsString } from "class-validator";
import { IsNumber } from "class-validator";

    
class ContractMeasureDto {
    @IsNumber() id: number;
    @IsNumber() measure_id: number;
    @IsNumber() portal_id: number;
    @IsString() bitrixId: string;
    @IsString() name: string;
    @IsString() shortName: string;
    @IsString() fullName: string;
    @IsString() created_at: string;
    @IsString() updated_at: string;
    @IsObject() measure: any;
}
export class ContracPortaltDto {
    @IsNumber() id: number;
    @IsString() name: string;
    @IsString() shortName: string;
    @IsString() fullName: string;
    @IsString() created_at: string;
    @IsString() updated_at: string;
}
export class ContractDto {
    @IsNumber() id: number;
    @IsObject() contract: ContracPortaltDto;
    @IsString() code: string;
    @IsString() shortName: string;
    @IsNumber() number: number;
    @IsString() aprilName: string;
    @IsString() bitrixName: string;
    @IsNumber() discount: number;
    @IsNumber() itemId: number;
    @IsNumber() prepayment: number;
    @IsNumber() order: number;
    @ValidateNested() @Type(() => ContractMeasureDto) portalMeasure: ContractMeasureDto;
    @IsNumber() measureCode: number;
    @IsString() measureFullName: string;
    @IsNumber() measureId: number;
    @IsString() measureName: string;
    @IsNumber() measureNumber: number;
}
