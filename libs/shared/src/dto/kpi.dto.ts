import { Transform } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsDate,
    IsNumber,
    IsOptional,
    IsString,
} from 'class-validator';
import { IBXUser } from '@lib/bitrix/domain/interfaces/bitrix.interface';
import { IFieldItem } from '@lib/portal-lib/portal/interfaces/portal.interface';

/**
 * Общие DTO KPI-отчётов (kpi-report-sales, kpi-report-service).
 * Обёртки над внешними интерфейсами Bitrix/Portal с валидацией.
 */
export class BitrixUser implements IBXUser {
    @IsBoolean()
    @IsOptional()
    ACTIVE?: boolean;

    @IsString()
    @IsOptional()
    DATE_REGISTER?: string;

    @IsString()
    @IsOptional()
    EMAIL?: string;

    @IsNumber()
    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? Number(value) : value,
    )
    ID?: number | string;

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
    @IsOptional()
    LAST_NAME?: string;

    @IsString()
    @IsOptional()
    NAME?: string;

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

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    TIMESTAMP_X?: string[];

    @IsString()
    @IsOptional()
    TIME_ZONE_OFFSET?: string;

    @IsArray()
    @IsNumber({}, { each: true })
    @IsOptional()
    UF_DEPARTMENT?: number[];

    @IsString()
    @IsOptional()
    UF_EMPLOYMENT_DATE?: string;

    @IsString()
    @IsOptional()
    UF_PHONE_INNER?: string;

    @IsString()
    @IsOptional()
    USER_TYPE?: string;

    @IsString()
    @IsOptional()
    WORK_PHONE?: string;

    @IsString()
    @IsOptional()
    WORK_POSITION?: string;
}

export class FieldItem implements IFieldItem {
    @IsNumber()
    id: number;

    @IsDate()
    created_at: Date;

    @IsDate()
    updated_at: Date;

    @IsNumber()
    bitrixfield_id: number;

    @IsString()
    name: string;

    @IsString()
    title: string;

    @IsString()
    code: string;

    @IsNumber()
    bitrixId: number;
}
