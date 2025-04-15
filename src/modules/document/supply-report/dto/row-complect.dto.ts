import { IsInt, IsString } from 'class-validator';

export class RowComplectDto {
  @IsString()
  type: string;

  @IsInt()
  number: number;
}
