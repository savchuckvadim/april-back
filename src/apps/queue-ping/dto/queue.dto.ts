import { IsString, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class QueuePingDto {
  @IsString()
  domain: string;

  @Type(() => Number) // если приходит как строка, но ты хочешь получить число
  @IsNumber()
  userId: number;

  @IsOptional()
  @IsString()
  socketId?: string;
}
