import { IsInt, IsOptional, IsString } from 'class-validator';

export class ComplectPackageDto {
  @IsInt()
  number: number;

  @IsOptional()
  @IsInt()
  regions?: number;

  @IsOptional()
  @IsInt()
  msk?: number;

  @IsString()
  name: string;

  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  weight: number;

  @IsString()
  type: string;
}
