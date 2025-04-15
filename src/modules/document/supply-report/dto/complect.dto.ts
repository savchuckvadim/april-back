import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';
import { ComplectValueDto } from './complect-value.dto';

export class ComplectDto {
  @IsString()
  groupsName: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComplectValueDto)
  value: ComplectValueDto[];
}
