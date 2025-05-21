import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { IBXContact } from "src/modules/bitrix/domain/interfaces/bitrix.interface";

export class ContactDto {
    @IsNumber()
    @Type(() => Number)
    ID: number;

    @IsString()
    NAME: string;

    @IsString()
    @IsOptional()
    LAST_NAME?: string;

    @IsString()
    @IsOptional()
    SECOND_NAME?: string;

    @IsString()
    @IsOptional()
    PHONE?: {
        VALUE: string;
        TYPE: string;
    }[];

    @IsString()
    @IsOptional()
    EMAIL?: {
        VALUE: string;
        TYPE: string;
    }[];

    @IsString()
    @IsOptional()
    POST?: string;

    @IsString()
    @IsOptional()
    COMMENTS?: string;

    @IsString()
    @IsOptional()
    COMPANY_ID?: string;

    @IsString()
    @IsOptional()
    ASSIGNED_BY_ID?: string;
}
