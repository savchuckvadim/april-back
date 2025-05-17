import { IBXContact } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { EEventItemResultType, WorkStatus, NoresultReason, FailType, FailReason } from '../../types/report-types';
import { IsBoolean, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ContactDto } from './contact.dto';

export class ReportDto {
  @IsString()
  resultStatus: EEventItemResultType;

  @IsString()
  description: string;

  @IsObject()
  workStatus: {
    current: WorkStatus;
  };

  @IsObject()
  noresultReason: {
    current: NoresultReason;
  };

  @IsObject()
  failType: {
    current: FailType;
  };

  @IsObject()
  failReason: {
    current: FailReason;
  };

  @IsOptional()
  @ValidateNested()
  @Type(() => ContactDto)
  contact: ContactDto | null;

  @IsBoolean()
  isNoCall: boolean;
}