import { Type } from "class-transformer";
import {
    IsArray,
    ValidateNested,
    IsNumber,
    IsString,
    IsOptional,
} from "class-validator";

export class RegionDto {
    @IsNumber() number: number;
    @IsNumber() abs: number;
    @IsString() name: string;
    @IsString() title: string;
    @IsString() infoblock: string;
    @IsOptional() @IsNumber() id?: number;
}

export class RegionsDto {
    @IsArray() @ValidateNested({ each: true }) @Type(() => RegionDto) inComplect: RegionDto[];
    @IsArray() @ValidateNested({ each: true }) @Type(() => RegionDto) favorite: RegionDto[];
    @IsArray() @ValidateNested({ each: true }) @Type(() => RegionDto) noWidth: RegionDto[];
}