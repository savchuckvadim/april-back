import {
  IsBoolean,
  IsInt,
  IsString,
  IsNumber,
} from 'class-validator';



export class SupplyDto {
  @IsString()
  acontractName: string;

  @IsString()
  acontractPropComment: string;

  @IsString()
  contractName: string;

  @IsNumber()
  coefficient: number;

  @IsString()
  contractProp1: string;

  @IsString()
  contractProp2: string;

  @IsString()
  contractPropComment: string;

  @IsString()
  contractPropEmail: string;

  @IsString()
  contractPropLoginsQuantity: string;

  @IsString()
  contractPropSuppliesQuantity: string;

  @IsBoolean()
  lcontractName: boolean;

  @IsBoolean()
  lcontractProp2: boolean;

  @IsBoolean()
  lcontractPropComment: boolean;

  @IsBoolean()
  lcontractPropEmail: boolean;

  @IsString()
  name: string;

  @IsInt()
  number: number;

  @IsString()
  quantityForKp: string;

  @IsString()
  type: string;
}
