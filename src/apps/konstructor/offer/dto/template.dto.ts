import { Type } from "class-transformer";
import { IsOptional, ValidateNested } from "class-validator";

import { IsArray } from "class-validator";

import { IsString } from "class-validator";

import { IsNumber } from "class-validator";
import { ProviderDto } from "../../../../modules/garant/provider";

class TemplateFieldDto {
    @IsNumber() id: number;
    @IsNumber() number: number;
    @IsArray() items: any[];
    @IsString() name: string;
    @IsString() code: string;
    @IsString() type: string;
    @IsNumber() isGeneral: number;
    @IsNumber() isDefault: number;
    @IsNumber() isRequired: number;
    @IsOptional() @IsString() value: string;
    @IsOptional() @IsString() description: string;
    @IsOptional() @IsString() bitixId: string;
    @IsOptional() @IsString() bitrixTemplateId: string;
    @IsNumber() isActive: number;
    @IsNumber() isPlural: number;
    @IsNumber() isClient: number;
}

export class TemplateDto {
    @IsNumber() id: number;
    @IsString() name: string;
    @IsString() code: string;
    @IsString() type: string;
    @IsString() portal: string;
    @IsArray() @ValidateNested({ each: true }) @Type(() => ProviderDto) providers: ProviderDto[];
    @IsArray() @ValidateNested({ each: true }) @Type(() => TemplateFieldDto) fields: TemplateFieldDto[];
    @IsArray() counters: any[];
    @IsNumber() number: number;
}