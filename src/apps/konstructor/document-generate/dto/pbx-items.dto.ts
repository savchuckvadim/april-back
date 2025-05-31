import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, ValidateNested, IsArray, IsObject } from 'class-validator';

/** 🔵 Тип enum-значения */
export class BitrixEnumItem {
  @IsString() id: string;
  @IsString() created_at: string;
  @IsString() updated_at: string;
  @IsString() bitrixfield_id: string;
  @IsString() name: string;
  @IsString() title: string;
  @IsString() code: string;
  @IsString() bitrixId: string;
}


export enum BitrixDealField {
    CONTRACT_CREATE_DATE = 'contract_create_date',
    FIRST_PAY_DATE = 'first_pay_date',
    SUPPLY_DATE = 'supply_date',
    CONTRACT_START = 'contract_start',
    CONTRACT_END = 'contract_end',
    GARANT_CLIENT_ASSIGNED_NAME = 'garant_client_assigned_name',
    GARANT_CLIENT_ASSIGNED_PHONE = 'garant_client_assigned_phone',
    GARANT_CLIENT_ASSIGNED_EMAIL = 'garant_client_assigned_email',
    CONTRACT_PRESENT_START = 'contract_present_start',
    CONTRACT_PRESENT_END = 'contract_present_end',
    GARANT_CLIENT_EMAIL = 'garant_client_email',
    SUPPLY_COMMENT = 'supply_comment',
    DOCUMENT_PROVIDER = 'document_provider'
}

export enum BitrixCompanyField {
    MANAGER_OP = 'manager_op',
    OP_CLIENT_TYPE = 'op_client_type',
    OP_CATEGORY = 'op_category',
    OP_CLIENT_STATUS = 'op_client_status',
    OP_SOURCE_SELECT = 'op_source_select',
    OP_CONCURENTS = 'op_concurents',
    SUPPLY_INFORMATION = 'supply_information',
    MANAGER_TMC = 'manager_tmc'
}

export enum BitrixFieldType {
    DATE = 'date',
    DATETIME = 'datetime',
    STRING = 'string',
    ENUMERATION = 'enumeration',
  }
  
  export class BitrixField {
    @IsString() id: string;
    @IsString() type: BitrixFieldType;
    @IsString() bitrixId: string;
    @IsString() code: string;
  
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BitrixEnumItem)
    items: BitrixEnumItem[];
  }
  

  export class BitrixBaseField<T = unknown> {
    @IsString() bitrixId: string;
  
    @IsBoolean() isRequired: boolean;
  
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BitrixEnumItem)
    items: BitrixEnumItem[];
  
    @IsOptional()
    @ValidateNested()
    @Type(() => BitrixField)
    field?: BitrixField;
  
    current: T;
  }
  
  export class BitrixEnumField extends BitrixBaseField<BitrixEnumItem> {
    @IsOptional()
    @ValidateNested()
    @Type(() => BitrixEnumItem)
    declare  current: BitrixEnumItem;
  }
  
  export class BitrixStringField extends BitrixBaseField<string> {
    @IsOptional()
    @IsString()
    declare  current: string;
  }
  
  export class BitrixDateField extends BitrixBaseField<string> {
    @IsString()
    declare  current: string;
  }
  

  export class BxCompanyItemsDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => BitrixEnumField)
    [BitrixCompanyField.OP_CLIENT_TYPE]?: BitrixEnumField;
  
    @IsOptional()
    @ValidateNested()
    @Type(() => BitrixEnumField)
    [BitrixCompanyField.MANAGER_OP]?: BitrixEnumField;
  
    @IsOptional()
    @ValidateNested()
    @Type(() => BitrixEnumField)
    [BitrixCompanyField.OP_CATEGORY]?: BitrixEnumField;
  
    @IsOptional()
    @ValidateNested()
    @Type(() => BitrixEnumField)
    [BitrixCompanyField.OP_CLIENT_STATUS]?: BitrixEnumField;
  
    @IsOptional()
    @ValidateNested()
    @Type(() => BitrixEnumField)
    [BitrixCompanyField.OP_SOURCE_SELECT]?: BitrixEnumField;
  
    @IsOptional()
    @ValidateNested()
    @Type(() => BitrixEnumField)
    [BitrixCompanyField.OP_CONCURENTS]?: BitrixEnumField;
  
    @IsOptional()
    @ValidateNested()
    @Type(() => BitrixStringField)
    [BitrixCompanyField.SUPPLY_INFORMATION]?: BitrixStringField;
  
    @IsOptional()
    @ValidateNested()
    @Type(() => BitrixEnumField)
    [BitrixCompanyField.MANAGER_TMC]?: BitrixEnumField;
  }
  
  export class BxDealItemsDto {
    @ValidateNested()
    @Type(() => BitrixDateField)
    [BitrixDealField.CONTRACT_CREATE_DATE]: BitrixDateField;

    @ValidateNested()
    @Type(() => BitrixDateField)
    [BitrixDealField.CONTRACT_START]: BitrixDateField;

    @IsOptional()
    @ValidateNested()
    @Type(() => BitrixDateField)
    [BitrixDealField.CONTRACT_END]?: BitrixDateField;

    @IsOptional()
    @ValidateNested()
    @Type(() => BitrixDateField)
    [BitrixDealField.FIRST_PAY_DATE]?: BitrixDateField;

    @IsOptional()
    @ValidateNested()
    @Type(() => BitrixDateField)
    [BitrixDealField.SUPPLY_DATE]?: BitrixDateField;
    
    
  }