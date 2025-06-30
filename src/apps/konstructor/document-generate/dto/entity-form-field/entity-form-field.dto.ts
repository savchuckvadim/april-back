import { PbxField, PbxFieldEntity, PbxFieldEntityType, PbxFieldItemEntity } from "@/modules/pbx-domain/field/pbx-field.entity";
import { IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested, ValidateIf, registerDecorator, ValidationOptions, ValidationArguments, IsBoolean, IsArray, IsNumber } from "class-validator";
import { Type } from "class-transformer";   
import { IsObjectOrStringOrNull } from "@/core/decorators/dto/object-or-string.decorator"
import { BitrixFieldType } from "../pbx-items.dto";
import { EUserFieldType } from "@/modules/bitrix";

export class PbxFieldDto {
    @IsNumber()
    id: number;
    
    @IsString({ message: 'PbxFieldDto name must be a string' })
    name: string;
    
    @IsString({ message: 'PbxFieldDto title must be a string' })
    title: string;
    
    @IsString({ message: 'PbxFieldDto code must be a string' })
    code: string;
    
    @IsString({ message: 'PbxFieldDto type must be a string' })
    type: BitrixFieldType | EUserFieldType | 'multiple';
    
    @IsString({ message: 'PbxFieldDto bitrixId must be a string' })
    bitrixId: string;
    
    @IsString({ message: 'PbxFieldDto bitrixCamelId must be a string' })
    bitrixCamelId: string;
    
    @IsNumber()
    entity_id: bigint;

    @IsOptional()
    @IsString({ message: 'PbxFieldDto entity_type must be a string' })
    entity_type: PbxFieldEntityType;
    
    @IsString({ message: 'PbxFieldDto parent_type must be a string' })
    parent_type: string;
    
    @IsArray({ message: 'PbxFieldDto PbxFieldItemDto items must be an array' })
    @ValidateNested({ each: true, message: 'each item must be a valid PbxFieldItemDto' })
    @Type(() => PbxFieldItemDto)
    items: PbxFieldItemDto[];

    @IsOptional()
    bitrixfielditems?:{}
}

export class PbxFieldItemDto {
    @IsNumber()
    id: number;
    
    @IsString({ message: 'PbxFieldItemDto name must be a string' })
    name: string;
    
    @IsString({ message: 'PbxFieldItemDto code must be a string' })
    title: string;
    
    @IsString({ message: 'PbxFieldItemDto code must be a string' })
    code: string;
    
    @IsNumber()
    bitrixfield_id: bigint;
    
    @IsNumber()
    bitrixId: number;
    
    @IsString({ message: 'PbxFieldItemDto created_at must be a string' })
    created_at: string;
    
    @IsString({ message: 'PbxFieldItemDto updated_at must be a string' })
    updated_at: string;
}

export class EntityFormFieldDto  {
    @IsObject()
    @ValidateNested({ message: 'field must be a valid PbxFieldDto' })
    @Type(() => PbxFieldDto)
    field: PbxFieldDto;

    @IsString({ message: 'bitrixId must be a string' })
    @IsNotEmpty()
    bitrixId: string;

    @IsOptional()
    @IsObjectOrStringOrNull({ message: 'current must be a valid PbxFieldItemDto or string or null' })
    current: PbxFieldItemDto | string | null;

    @IsBoolean()
    isRequired: boolean;

    @IsArray({ message: 'items must be an array' })
    @ValidateNested({ each: true, message: 'each item must be a valid PbxFieldItemDto' })
    @Type(() => PbxFieldItemDto)
    items: PbxFieldItemDto[];
}

