import { IsEnum, IsNumber, IsOptional } from "class-validator";
import { IsArray } from "class-validator";
import { IsBoolean } from "class-validator";
import { IsString } from "class-validator";
import { CONTRACT_RQ_GROUP, RQ_TYPE, SupplyTypeEnum } from "../../type/bx-rq.type";
import { CONTRACT_LTYPE } from "../../type/contract.type";
import { IsObjectOrStringOrNull } from "@/core/decorators/dto/object-or-string.decorator";
import { PbxFieldItemDto } from "../entity-form-field/entity-form-field.dto";
import { ApiProperty } from "@nestjs/swagger";


export enum FormFieldTypeEnum {
    STRING = 'string',
    TEXT = 'text',
    DATE = 'date',
    FILE = 'file',
    SELECT = 'select'
}
export class SmartFieldDto {
    @IsNumber()
    id: number;

    @IsString()
    url: string;

    @IsString()
    urlMachine: string;
   
}


export class DealFieldDto {
    @IsNumber()
    id: number;

    @IsString()
    downLoadUrl: string;


   
}
export class FormFieldDto {
    @ApiProperty({ description: 'Type of the FormFieldDto' })

    @IsEnum(FormFieldTypeEnum, { message: 'FormFieldDto type must be a valid type' })
    type: FormFieldTypeEnum;

    @ApiProperty({ description: 'Name of the FormFieldDto' })
    @IsString({ message: 'FormFieldDto name must be a string' })
    name: string;

    @ApiProperty({ description: 'IsRequired of the FormFieldDto' })
    @IsOptional()
    @IsBoolean({ message: 'FormFieldDto isRequired must be a boolean' })
    isRequired: boolean;

    @ApiProperty({ description: 'Includes of the FormFieldDto' })
    @IsOptional()
    @IsArray({ message: 'FormFieldDto includes must be an array' })
    @IsEnum(RQ_TYPE, { each: true, message: 'FormFieldDto includes each item must be a valid RQ_TYPE' })
    includes: RQ_TYPE[]; // You can replace with enum RQ_TYPE if available

    @ApiProperty({ description: 'Supplies of the FormFieldDto' })
    @IsOptional()
    @IsArray({ message: 'FormFieldDto supplies must be an array' })
    @IsEnum(SupplyTypeEnum, { each: true, message: 'FormFieldDto supplies each item must be a valid SupplyTypeEnum' })
    supplies?: SupplyTypeEnum[]; // Replace with enum SupplyTypesType if defined

    @ApiProperty({ description: 'ContractType of the FormFieldDto' })
    @IsOptional()
    @IsArray({ message: 'FormFieldDto contractType must be an array' })
    @IsEnum(CONTRACT_LTYPE, { each: true, message: 'FormFieldDto contractType each item must be a valid CONTRACT_LTYPE' })
    contractType?: CONTRACT_LTYPE[]; // Replace with enum CONTRACT_LTYPE if defined

    @ApiProperty({ description: 'Group of the FormFieldDto' })
    @IsOptional()
    @IsEnum(CONTRACT_RQ_GROUP, { message: 'FormFieldDto group must be a valid CONTRACT_RQ_GROUP' })
    group: CONTRACT_RQ_GROUP;

    @ApiProperty({ description: 'IsActive of the FormFieldDto' })
    @IsBoolean({ message: 'FormFieldDto isActive must be a boolean' })
    isActive: boolean;

    @ApiProperty({ description: 'IsDisable of the FormFieldDto' })
    @IsBoolean({ message: 'FormFieldDto isDisable must be a boolean' })
    isDisable: boolean;


    @ApiProperty({ description: 'Order of the FormFieldDto' })
    @IsOptional()
    @IsNumber()
    order: number;

    @ApiProperty({ description: 'Component of the FormFieldDto' })
    @IsOptional()
    @IsString({ message: 'FormFieldDto component must be a valid component "base" | "contract" | "invoice" | "client" ' })
    component?:  "base" | "contract" | "invoice" | "client";

    @ApiProperty({ description: 'IsHidden of the FormFieldDto' })
    @IsOptional()
    @IsBoolean({ message: 'FormFieldDto isHidden must be a boolean' })
    isHidden?: boolean;


    @ApiProperty({ description: 'Value of the FormFieldDto' })
    @IsOptional()
    @IsObjectOrStringOrNull()
    value: string | null | SmartFieldDto | DealFieldDto | PbxFieldItemDto;
}
