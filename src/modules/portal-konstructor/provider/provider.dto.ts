import { IsBoolean } from "class-validator";
import { Type } from "class-transformer";
import { IsArray } from "class-validator";
import { ValidateNested } from "class-validator";
import { IsOptional } from "class-validator";
import { IsNumber } from "class-validator";
import { IsString } from "class-validator";

class LogoDto {
    @IsString() name: string;
    @IsString() code: string;
    @IsString() type: string;
    @IsString() path: string;
}

class RqDto {
    @IsNumber() id: number;
    @IsString() number: string;
    @IsString() name: string;
    @IsString() type: string;
    @IsString() fullname: string;
    @IsString() shortname: string;
    @IsString() director: string;
    @IsString() position: string;
    @IsOptional() @IsString() accountant: string;
    @IsString() based: string;
    @IsString() inn: string;
    @IsOptional() @IsString() kpp: string;
    @IsOptional() @IsString() ogrn: string;
    @IsOptional() @IsString() ogrnip: string;
    @IsOptional() @IsString() personName: string;
    @IsOptional() @IsString() document: string;
    @IsOptional() @IsString() docSer: string;
    @IsOptional() @IsString() docNum: string;
    @IsOptional() @IsString() docDate: string;
    @IsOptional() @IsString() docIssuedBy: string;
    @IsOptional() @IsString() docDepCode: string;
    @IsString() registredAdress: string;
    @IsString() primaryAdresss: string;
    @IsString() email: string;
    @IsOptional() @IsString() garantEmail: string;
    @IsString() phone: string;
    @IsOptional() @IsString() assigned: string;
    @IsOptional() @IsString() assignedPhone: string;
    @IsOptional() @IsString() other: string;
    @IsString() bank: string;
    @IsString() bik: string;
    @IsString() rs: string;
    @IsString() ks: string;
    @IsString() bankAdress: string;
    @IsOptional() @IsString() bankOther: string;
    @IsArray() @ValidateNested({ each: true }) @Type(() => LogoDto) logos: LogoDto[];
    @IsArray() @ValidateNested({ each: true }) @Type(() => LogoDto) stamps: LogoDto[];
    @IsArray() @ValidateNested({ each: true }) @Type(() => LogoDto) signatures: LogoDto[];
    @IsArray() qrs: any[];
    @IsString() domain: string;
}

export class ProviderDto {
    @IsNumber() id: number;
    @IsString() name: string;
    @IsString() code: string;
    @IsString() type: string;
    @IsBoolean() withTax: boolean;
    @ValidateNested() @Type(() => RqDto) rq: RqDto;
}