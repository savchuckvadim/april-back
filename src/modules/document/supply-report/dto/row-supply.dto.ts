import { IsInt, IsOptional, IsString } from 'class-validator';

export class RowSupplyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  forkp?: string;

  @IsInt()
  number: number;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  contractName?: string;

  @IsOptional()
  @IsString()
  contractProp2?: string;

  @IsOptional()
  @IsString()
  contractProp1?: string;

  @IsOptional()
  @IsString()
  contractPropComment?: string;

  @IsOptional()
  @IsString()
  contractPropEmail?: string;
}
