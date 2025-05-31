import { IsEnum, IsNumber, IsOptional } from "class-validator";
import { IsArray } from "class-validator";
import { IsBoolean } from "class-validator";
import { IsString } from "class-validator";
import { CONTRACT_RQ_GROUP, RQ_TYPE, SupplyTypeEnum } from "../../type/bx-rq.type";
import { CONTRACT_LTYPE } from "../../type/contract.type";

export class FormFieldDto {
    @IsString   ()
    type: "string" | "text" | "date";

    @IsString()
    name: string;

    @IsBoolean()
    isRequired: boolean;



    @IsArray()
    @IsEnum(RQ_TYPE, { each: true })
    includes: RQ_TYPE[]; // You can replace with enum RQ_TYPE if available

    @IsOptional()
    @IsArray()
    @IsEnum(SupplyTypeEnum, { each: true })
    supplies?: SupplyTypeEnum[]; // Replace with enum SupplyTypesType if defined

    @IsOptional()
    @IsArray()
    @IsEnum(CONTRACT_LTYPE, { each: true })
    contractType?: CONTRACT_LTYPE[]; // Replace with enum CONTRACT_LTYPE if defined

    @IsEnum(CONTRACT_RQ_GROUP)
    group: CONTRACT_RQ_GROUP;

    @IsBoolean()
    isActive: boolean;

    @IsBoolean()
    isDisable: boolean;

    @IsNumber()
    order: number;

    @IsOptional()
    @IsString()
    component?:  "base" | "contract" | "invoice" | "client";

    @IsOptional()
    @IsBoolean()
    isHidden?: boolean;


    @IsString()
    value: string;
}
