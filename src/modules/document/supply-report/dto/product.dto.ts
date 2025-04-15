// src/modules/document/dto/product.dto.ts
import {
    IsBoolean,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
    IsDefined,
    IsObject,
  } from 'class-validator';
  import { Type } from 'class-transformer';
  import { ContractDto } from './contract.dto';
  
  export class ProductDto {
    @IsInt()
    number: number;
  
    @IsString()
    name: string;
  
    @IsOptional()
    @IsInt()
    productId?: number;
  
    @IsString()
    type: string;
  
    @IsInt()
    complectNumber: number;
  
    @IsString()
    complectName: string;
  
    @IsBoolean()
    withConsalting: boolean;
  
    @IsOptional()
    @IsString()
    complectType?: string;
  
    @IsBoolean()
    abs: boolean;
  
    @IsInt()
    supplyNumber: number;
  
    @IsOptional()
    @IsString()
    supplyName?: string;
  
    @IsOptional()
    @IsString()
    supplyType?: string;
  
    @IsOptional()
    @IsString()
    quantityForKp?: string;
  
    @IsDefined()
    @IsObject() // или @IsBoolean() если там булево
    supply: Record<string, any> | boolean;
  
    @IsOptional()
    @IsString()
    contractSupplyName?: string;
  
    @IsOptional()
    @IsString()
    contractSupplyProp1?: string;
  
    @IsOptional()
    @IsString()
    contractSupplyProp2?: string;
  
    @IsOptional()
    @IsString()
    contractSupplyPropComment?: string;
  
    @IsOptional()
    @IsString()
    contractSupplyPropEmail?: string;
  
    @IsOptional()
    @IsString()
    contractSupplyPropLoginsQuantity?: string;
  
    @IsOptional()
    @IsString()
    contractSupplyPropSuppliesQuantity?: string;
  
    @ValidateNested()
    @Type(() => ContractDto)
    contract: ContractDto;
  
    @IsString()
    contractName: string;
  
    @IsString()
    contractShortName: string;
  
    @IsInt()
    contractNumber: number;
  
    @IsInt()
    measureNumber: number;
  
    @IsInt()
    measureId: number;
  
    @IsInt()
    measureCode: number;
  
    @IsString()
    measureName: string;
  
    @IsString()
    measureFullName: string;
  
    @IsNumber()
    prepayment: number;
  
    @IsNumber()
    contractCoefficient: number;
  
    @IsNumber()
    discount: number;
  
    @IsOptional()
    @IsString()
    contractConsaltingProp?: string;
  
    @IsOptional()
    @IsString()
    contractConsaltingComment?: string;
  
    @IsBoolean()
    withPrice: boolean;
  
    @IsBoolean()
    withAbs: boolean;
  
    @IsNumber()
    price: number;
  
    @IsNumber()
    totalPrice: number;
  
    @IsBoolean()
    mskPrice: boolean;
  
    @IsBoolean()
    regionsPrice: boolean;
  }
  