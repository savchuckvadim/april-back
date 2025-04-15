import { Type } from 'class-transformer';
import { IsInt, IsString, IsNumber, ValidateNested } from 'class-validator';
import { InnerContractDto } from './inner-contract-dto'
import { PortalMeasureDto } from './portal-measure.dto';

export class ContractDto {
  @IsInt()
  id: number;

  @ValidateNested()
  @Type(() => InnerContractDto)
  contract: InnerContractDto;

  @IsString()
  code: string;

  @IsString()
  shortName: string;

  @IsInt()
  number: number;

  @IsString()
  aprilName: string;

  @IsString()
  bitrixName: string;

  @IsNumber()
  discount: number;

  @IsInt()
  itemId: number;

  @IsNumber()
  prepayment: number;

  @IsInt()
  order: number;

  @ValidateNested()
  @Type(() => PortalMeasureDto)
  portalMeasure: PortalMeasureDto;

  @IsInt()
  measureCode: number;

  @IsString()
  measureFullName: string;

  @IsInt()
  measureId: number;

  @IsString()
  measureName: string;

  @IsInt()
  measureNumber: number;
}



