import { IsNumber } from "class-validator";
import { IsString } from "class-validator";
import { IsOptional } from "class-validator";

export class SupplyDto {
    @IsNumber() contractPropSuppliesQuantity: number;
    @IsOptional() @IsString() lcontractProp2: string;
    @IsString() lcontractName: string;
    @IsString() lcontractPropEmail: string;
    @IsString() type: string;
    @IsString() contractPropLoginsQuantity: string;
    @IsNumber() number: number;
    @IsString() acontractName: string;
    @IsString() contractPropComment: string;
    @IsString() contractPropEmail: string;
    @IsString() quantityForKp: string;
    @IsString() name: string;
    @IsNumber() coefficient: number;
    @IsString() acontractPropComment: string;
    @IsString() contractName: string;
    @IsString() lcontractPropComment: string;
    @IsOptional() @IsString() contractProp2: string;
    @IsOptional() @IsString() contractProp1: string;
}
