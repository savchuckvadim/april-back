import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested, IsNumber } from 'class-validator';
// Общие обёртки над внешними интерфейсами вынесены в @lib/shared
// (используются также приложением kpi-report-service).
import { BitrixUser, FieldItem } from '@lib/shared';

export { BitrixUser, FieldItem };

// export enum EDownloadType {
//     EXCEL = 'excel',
//     PDF = 'pdf',
// }

export class DateRangeDto {
    @ApiProperty({ description: 'From date' })
    @IsString()
    from: string;

    @ApiProperty({ description: 'To date' })
    @IsString()
    to: string;
}
export class ReportData {
    @ApiProperty({ description: 'User ID' })
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'User data' })
    @ValidateNested()
    @Type(() => BitrixUser)
    user: BitrixUser;

    @ApiProperty({ description: 'User name' })
    @IsString()
    userName?: string;

    @ApiProperty({ description: 'KPI data' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => KPI)
    kpi: KPI[];
}

// export class KpiReportDto {
//     // @IsEnum(EDownloadType)
//     // type: EDownloadType;

//     @IsArray()
//     @ValidateNested({ each: true })
//     @Type(() => ReportData)
//     report: ReportData[];

//     @Type(() => DateRangeDto)
//     @ValidateNested()
//     date: DateRangeDto;
// }

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

export type FilterInnerCode =
    | 'result_communication_done'
    | 'result_communication_plan'
    | 'call_plan'
    | 'call_expired'
    | 'call_done'
    | 'call_pound'
    | 'call_act_noresult_fail'
    | 'presentation_plan'
    | 'presentation_expired'
    | 'presentation_done'
    | 'presentation_pound'
    | 'presentation_act_noresult_fail'
    | 'presentation_uniq_plan'
    | 'presentation_uniq_expired'
    | 'presentation_uniq_done'
    | 'presentation_uniq_pound'
    | 'presentation_uniq_act_noresult_fail'
    | 'presentation_contact_uniq_plan'
    | 'presentation_contact_uniq_done'
    | 'ev_offer_act_send'
    | 'ev_offer_pres_act_send'
    | 'ev_invoice_act_send'
    | 'ev_invoice_pres_act_send'
    | 'ev_contract_act_send'
    | 'ev_success_done'
    | 'ev_fail_done';

export type FilterCode =
    | 'xo_plan' //тип события презентация, звонок
    | 'xo_expired' // событие запланирован, совершен
    | 'xo_done' // дата события
    | 'xo_pound'
    | 'xo_act_noresult_fail'
    // Заявка с сайта / входящий звонок: свои коды события (типы xoRequest и
    // xoLead в event-sales), но в сводке считаются «Звонком».
    | 'site_plan'
    | 'site_expired'
    | 'site_done'
    | 'site_pound'
    | 'site_act_noresult_fail'
    | 'come_call_plan'
    | 'come_call_expired'
    | 'come_call_done'
    | 'come_call_pound'
    | 'come_call_act_noresult_fail'
    | 'call_plan'
    | 'call_expired'
    | 'call_done'
    | 'call_pound'
    | 'call_act_noresult_fail'
    | 'call_in_progress_plan'
    | 'call_in_progress_expired'
    | 'call_in_progress_done'
    | 'call_in_progress_pound'
    | 'call_in_progress_act_noresult_fail'
    | 'call_in_money_plan'
    | 'call_in_money_expired'
    | 'call_in_money_done'
    | 'call_in_money_pound'
    | 'call_in_money_act_noresult_fail'
    | 'presentation_plan'
    | 'presentation_expired'
    | 'presentation_done'
    | 'presentation_pound'
    | 'presentation_act_noresult_fail'
    | 'presentation_uniq_plan'
    | 'presentation_uniq_expired'
    | 'presentation_uniq_done'
    | 'presentation_uniq_pound'
    | 'presentation_uniq_act_noresult_fail'
    | 'ev_offer_act_send'
    | 'ev_offer_pres_act_send'
    | 'ev_invoice_act_send'
    | 'ev_invoice_pres_act_send'
    | 'ev_contract_act_send'
    | 'ev_success_done'
    | 'ev_fail_done';

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
