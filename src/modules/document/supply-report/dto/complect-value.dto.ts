import { IsBoolean, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class ComplectValueDto {
  @IsOptional()
  @IsInt()
  number?: number;

  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsBoolean()
  checked: boolean;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isLa?: boolean;
}
