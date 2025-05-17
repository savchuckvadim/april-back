
import { IBXUser } from "src/modules/bitrix/domain/interfaces/bitrix.interface";
import { IFieldItem } from "src/modules/portal/interfaces/portal.interface";

export class KpiReportDto {
    type: EDownloadType
    report: ReportData[]
    date: {
        from: string
        to: string
    }


}
export enum EDownloadType {
    EXCEL = 'excel',
    PDF = 'pdf',
}

export interface ReportData {
    user: IBXUser;
    userName?: string
    // callings: KPICall[]
    kpi: KPI[]
}

export type KPIAction = {
    id: number
    name: string
    // shortName?: string

}
export type KPI = {
    id: string
    action: Filter
    count: number
    list?: Array<KPIListItem>

}
type KPIListItem = {
    id: number
    crm: string
    name: string
    date: string
    file: string
    link: string
    action: KPIAction
}
export type Filter = {
    order: number
    actionItem: IFieldItem
    actionTypeItem: IFieldItem
    innerCode: FilterInnerCode
    name?: string
    code: FilterCode


}

export type FilterInnerCode = 'result_communication_done' |
    'result_communication_plan' | 'call_plan' | 'call_expired' | 'call_done' | 'call_pound' | 'call_act_noresult_fail' |
    'presentation_plan' | 'presentation_expired' | 'presentation_done' | 'presentation_pound' | 'presentation_act_noresult_fail' |
    'presentation_uniq_plan' | 'presentation_uniq_expired' | 'presentation_uniq_done' | 'presentation_uniq_pound' | 'presentation_uniq_act_noresult_fail' |
    'presentation_contact_uniq_plan' |  'presentation_contact_uniq_done' | 
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

