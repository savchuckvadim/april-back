import { IBXUser, IBXContact } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { IsBoolean, IsObject, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EventPlanCall } from '../types/plan-types';

export class PlanDto {
  @ValidateNested()
  @Type(() => Object)
  responsibility: IBXUser;

  @ValidateNested()
  @Type(() => Object)
  createdBy: IBXUser;

  @IsObject()
  type: { current: EventPlanCall };

  @IsString()
  name: string;

  @IsString()
  deadline: string;

  @IsBoolean()
  isPlanned: boolean;

  @ValidateNested()
  @Type(() => Object)
  contact: IBXContact;

  @IsBoolean()
  isActive: boolean;
}