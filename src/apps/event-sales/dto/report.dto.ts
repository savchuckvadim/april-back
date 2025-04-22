import { IBXContact } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { EEventItemResultType, WorkStatus, NoresultReason, FailType, FailReason } from '../types/report-types';
import { IsBoolean, IsObject, IsString } from 'class-validator';

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

  @IsObject()
  contact: IBXContact;

  @IsBoolean()
  isNoCall: boolean;
}