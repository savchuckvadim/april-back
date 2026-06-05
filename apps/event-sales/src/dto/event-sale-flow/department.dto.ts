import {
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DepartamentModeDto {
    @IsNumber()
    id: number;

    @IsString()
    code: 'sales' | 'tmc'; // можешь добавить другие значения, если они есть

    @IsString()
    name: string;
}

export class DepartamentDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => DepartamentModeDto)
    mode?: DepartamentModeDto;
}
