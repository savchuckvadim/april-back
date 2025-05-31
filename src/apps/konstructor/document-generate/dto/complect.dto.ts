import { IsBoolean } from "class-validator";
import { IsNumber } from "class-validator";
import { IsOptional } from "class-validator";
import { IsString } from "class-validator";
import { IsArray } from "class-validator";
import { ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class ComplectValueDto {
    @IsString() name: string;
    @IsOptional() @IsString() title?: string;
    @IsOptional() @IsNumber() number?: number;
    @IsOptional() @IsString() code?: string;
    @IsBoolean() checked: boolean;
    @IsNumber() weight: number;
    @IsString() description: string;
    @IsOptional() @IsBoolean() isLa?: boolean;
}

export class ComplectDto {
    @IsString() groupsName: string;
    @IsArray() @ValidateNested({ each: true }) @Type(() => ComplectValueDto) value: ComplectValueDto[];
}
