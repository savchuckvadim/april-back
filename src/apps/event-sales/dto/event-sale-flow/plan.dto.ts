import { IsBoolean, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EventPlanCall } from '../../types/plan-types';
import { MinimalUserDto } from './user.dto';
import { ContactDto } from './contact.dto';

export class PlanDto {
  @ValidateNested()
  @Type(() => MinimalUserDto)
  responsibility: MinimalUserDto;

  @ValidateNested()
  @Type(() => MinimalUserDto)
  createdBy: MinimalUserDto;

  @IsObject()
  type: { current: EventPlanCall };

  @IsString()
  name: string;

  @IsString()
  deadline: string;

  @IsBoolean()
  isPlanned: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContactDto)
  contact: ContactDto | null;

  @IsBoolean()
  isActive: boolean;
}