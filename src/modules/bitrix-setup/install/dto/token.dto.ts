import { IsString, IsOptional, IsDateString } from 'class-validator';

export class BitrixTokenDto {
  @IsString()
  access_token: string;

  @IsString()
  refresh_token: string;

  @IsDateString()
  expires_at: string;

  @IsString()
  application_token: string;

  @IsString()
  member_id: string;
}
