import { Transform, Type } from "class-transformer";
import { IsArray, IsEnum, IsString, ValidateNested, IsNumber, IsOptional, IsBoolean, IsDate } from "class-validator";
import { IBXUser } from "src/modules/bitrix/domain/interfaces/bitrix.interface";
import { IFieldItem } from "src/modules/portal/interfaces/portal.interface";

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
    @Transform(({ value }) => typeof value === 'string' ? Number(value) : value)
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
    @IsString()
    from: string;
    @IsString()
    to: string;
}
export class ReportData {
    @ValidateNested()
    @Type(() => BitrixUser)
    user: BitrixUser;

    @IsString()
    userName?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => KPI)
    kpi: KPI[];
}


export class KpiReportDto {

    @IsEnum(EDownloadType)
    type: EDownloadType;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReportData)
    report: ReportData[]


    @Type(() => DateRangeDto)
    @ValidateNested()
    date: DateRangeDto;


}




export class KPIAction {
    @IsNumber()
    id: number;

    @IsString()
    name: string;
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

export class Filter {
    @IsNumber()
    order: number;

    @ValidateNested()
    @Type(() => FieldItem)
    actionItem: FieldItem;

    @ValidateNested()
    @Type(() => FieldItem)
    actionTypeItem: FieldItem;

    @IsString()
    innerCode: FilterInnerCode;

    @IsString()
    name?: string;

    @IsString()
    code: FilterCode;
}

export type FilterInnerCode = 'result_communication_done' |
    'result_communication_plan' | 'call_plan' | 'call_expired' | 'call_done' | 'call_pound' | 'call_act_noresult_fail' |
    'presentation_plan' | 'presentation_expired' | 'presentation_done' | 'presentation_pound' | 'presentation_act_noresult_fail' |
    'presentation_uniq_plan' | 'presentation_uniq_expired' | 'presentation_uniq_done' | 'presentation_uniq_pound' | 'presentation_uniq_act_noresult_fail' |
    'presentation_contact_uniq_plan' | 'presentation_contact_uniq_done' |
    'ev_offer_act_send' | 'ev_offer_pres_act_send' | 'ev_invoice_act_send' | 'ev_invoice_pres_act_send' | 'ev_contract_act_send' | 'ev_success_done' |
    'ev_fail_done'

export type FilterCode = 'xo_plan' | //тип события презентация, звонок
    'xo_expired' | // событие запланирован, совершен
    'xo_done' | // дата события
    'xo_pound' |
    'xo_act_noresult_fail' |
    'call_plan' | 'call_expired' | 'call_done' | 'call_pound' | 'call_act_noresult_fail' |
    'call_in_progress_plan' | 'call_in_progress_expired' | 'call_in_progress_done' | 'call_in_progress_pound' | 'call_in_progress_act_noresult_fail' |
    'call_in_money_plan' | 'call_in_money_expired' | 'call_in_money_done' | 'call_in_money_pound' | 'call_in_money_act_noresult_fail' |

    'presentation_plan' | 'presentation_expired' | 'presentation_done' | 'presentation_pound' | 'presentation_act_noresult_fail' |
    'presentation_uniq_plan' | 'presentation_uniq_expired' | 'presentation_uniq_done' | 'presentation_uniq_pound' | 'presentation_uniq_act_noresult_fail' |
    'ev_offer_act_send' | 'ev_offer_pres_act_send' | 'ev_invoice_act_send' | 'ev_invoice_pres_act_send' | 'ev_contract_act_send' | 'ev_success_done' |
    'ev_fail_done'

export class KPI {
    @IsString()
    id: string;

    @ValidateNested()
    @Type(() => Filter)
    action: Filter;

    @IsNumber()
    count: number;

    // @IsArray()
    // @ValidateNested({ each: true })
    // @Type(() => KPIListItem)
    // list?: Array<KPIListItem>;
}