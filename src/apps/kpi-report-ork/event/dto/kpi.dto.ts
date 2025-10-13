import { Transform, Type } from 'class-transformer';
import {
    IsArray,
    IsEnum,
    IsString,
    ValidateNested,
    IsNumber,
    IsOptional,
    IsBoolean,
    IsDate,
} from 'class-validator';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { IFieldItem } from 'src/modules/portal/interfaces/portal.interface';
import { EnumFilterCode, EnumFilterInnerCode, FilterCode, FilterInnerCode } from '../type/ork-report-event.type';
import { ApiProperty } from '@nestjs/swagger';

// Wrapper classes for external interfaces
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
    @Transform(({ value }) =>
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

export enum EDownloadType {
    EXCEL = 'excel',
    PDF = 'pdf',
}

export class DateRangeDto {
    @ApiProperty()
    @IsString()
    from: string;
    @ApiProperty()
    @IsString()
    to: string;
}


export class KPIAction {
    @ApiProperty()
    @IsNumber()
    id: number;

    @ApiProperty()
    @IsString()
    name: string;
}


export class Filter {
    @ApiProperty()
    @IsNumber()
    order: number;

    @ApiProperty({ type: FieldItem })
    @ValidateNested()
    @Type(() => FieldItem)
    actionItem: FieldItem;

    @ApiProperty({ type: FieldItem })
    @ValidateNested()
    @Type(() => FieldItem)
    actionTypeItem: FieldItem;

    @ApiProperty({ enum: EnumFilterInnerCode })
    @IsEnum(EnumFilterInnerCode)
    innerCode: EnumFilterInnerCode;

    @ApiProperty()
    @IsString()
    name?: string;

    @ApiProperty({ enum: EnumFilterCode })
    @IsEnum(EnumFilterCode)
    code: EnumFilterCode;
}


export class KPI {
    @ApiProperty()
    @IsString()
    id: string;

    @ApiProperty({ type: Filter })
    @ValidateNested()
    @Type(() => Filter)
    action: Filter;

    @ApiProperty()
    @IsNumber()
    count: number;

    // @IsArray()
    // @ValidateNested({ each: true })
    // @Type(() => KPIListItem)
    // list?: Array<KPIListItem>;
}


export class ReportData {
    @ApiProperty()
    @ValidateNested()
    @Type(() => BitrixUser)
    user: BitrixUser;

    @ApiProperty()
    @IsString()
    userName?: string;

    @ApiProperty({ type: [KPI], description: 'KPI data' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => KPI)
    kpi: KPI[];
}



export class KpiReportDto {
    @ApiProperty()
    @IsEnum(EDownloadType)
    type: EDownloadType;

    @ApiProperty({ type: [ReportData], description: 'Report data' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReportData)
    report: ReportData[];

    @ApiProperty()
    @Type(() => DateRangeDto)
    @ValidateNested()
    date: DateRangeDto;
}
// export class KPIListItem {
//     @IsNumber()
//     id: number;

//     @IsString()
//     crm: string;

//     @IsString()
//     name: string;

//     @IsString()
//     date: string;

//     @IsString()
//     file: string;

//     @IsString()
//     link: string;

//     @ValidateNested()
//     @Type(() => KPIAction)
//     action: KPIAction;
// }
