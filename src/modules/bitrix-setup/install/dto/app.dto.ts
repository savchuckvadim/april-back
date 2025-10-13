import { Type } from 'class-transformer';
import { ValidateNested, IsString } from 'class-validator';
import { BitrixTokenDto } from './token.dto';

export class BitrixAppDto {
  @IsString()
  domain: string;

  @IsString()
  code: string;

  @IsString()
  group: string;

  @IsString()
  type: string;

  @IsString()
  status: string;

  @ValidateNested()
  @Type(() => BitrixTokenDto)
  token: BitrixTokenDto;
}
