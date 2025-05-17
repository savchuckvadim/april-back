import { IsBoolean, IsNumber, IsOptional, IsString, IsArray, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';

export class MinimalUserDto {
    @IsNumber()
    ID: number;
}

export class FullUserDto implements IBXUser {
    @IsNumber()
    ID: number;

    @IsBoolean()
    ACTIVE: boolean;

    @IsString()
    DATE_REGISTER: string;

    @IsString()
    @IsOptional()
    EMAIL?: string;

    @IsString()
    @IsOptional()
    IS_ONLINE?: string;

    @IsString()
    @IsOptional()
    LAST_ACTIVITY_DATE?: string;

    @IsString()
    @IsOptional()
    LAST_LOGIN?: string;

    @IsString()
    LAST_NAME: string;

    @IsString()
    NAME: string;

    @IsString()
    @IsOptional()
    PERSONAL_BIRTHDAY?: string;

    @IsString()
    @IsOptional()
    PERSONAL_CITY?: string;

    @IsString()
    @IsOptional()
    PERSONAL_GENDER?: string;

    @IsString()
    @IsOptional()
    PERSONAL_MOBILE?: string;

    @IsString()
    @IsOptional()
    PERSONAL_PHOTO?: string;

    @IsString()
    @IsOptional()
    PERSONAL_WWW?: string;

    @IsString()
    @IsOptional()
    SECOND_NAME?: string;

    @IsString()
    @IsOptional()
    TIMESTAMP_X?: string[];

    @IsArray()
    @IsNumber({}, { each: true })
    UF_DEPARTMENT: number[];
}

export type UserDto = MinimalUserDto | FullUserDto; 