import { IsInt, IsString, IsOptional, IsNumber } from 'class-validator';

export class InnerContractDto {
  @IsInt()
  id: number;

  @IsString()
  created_at: string;

  @IsString()
  updated_at: string;

  @IsString()
  name: string;

  @IsInt()
  number: number;

  @IsString()
  title: string;

  @IsString()
  code: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  template?: string;

  @IsInt()
  order: number;

  @IsNumber()
  coefficient: number;

  @IsNumber()
  prepayment: number;

  @IsNumber()
  discount: number;

  @IsString()
  productName: string;

  @IsOptional()
  @IsString()
  product?: string;

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  comment1?: string;

  @IsOptional()
  @IsString()
  comment2?: string;

  @IsInt()
  withPrepayment: number;
}
