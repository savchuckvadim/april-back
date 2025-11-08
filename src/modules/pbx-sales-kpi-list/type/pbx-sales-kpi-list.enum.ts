export enum EnumSalesKpiFieldCode {
    event_date = 'sales_kpi_event_date',
    event_title = 'sales_kpi_event_title',
    plan_date = 'sales_kpi_plan_date',
    author = 'author',
    responsible = 'sales_kpi_responsible',
    su = 'sales_kpi_su',
    crm = 'sales_kpi_crm',
    manager_comment = 'sales_kpi_manager_comment',
    event_type = 'sales_kpi_event_type',
    event_action = 'sales_kpi_event_action',
    op_result_status = 'sales_kpi_op_result_status',
    op_noresult_reason = 'sales_kpi_op_noresult_reason',
    op_work_status = 'sales_kpi_op_work_status',
    // op_fail_type = 'op_fail_type',
    op_fail_reason = 'op_fail_reason',
    crm_company = 'sales_kpi_crm_company',
    crm_contact = 'sales_kpi_crm_contact',
}

export enum EnumSalesKpiEventType {
    xo = 'xo',
    call = 'call',
    presentation = 'presentation',
    info = 'info',
    seminar = 'seminar',
    call_in_progress = 'call_in_progress',
    call_in_money = 'call_in_money',
    come_call = 'come_call',
    site = 'site',



    presentation_uniq = 'presentation_uniq',
    presentation_contact_uniq = 'presentation_contact_uniq',
    ev_offer = 'ev_offer',
    ev_invoice = 'ev_invoice',
    ev_offer_pres = 'ev_offer_pres',
    ev_invoice_pres = 'ev_invoice_pres',
    ev_contract = 'ev_contract',
    ev_supply = 'ev_supply',
    ev_success = 'ev_success',
    ev_fail = 'ev_fail',
}
export enum EnumSalesKpiEventAction {
    plan = 'plan',
    expired = 'expired',
    done = 'done',
    pound = 'pound',
    act_noresult_fail = 'act_noresult_fail',
    act_init_send = 'act_init_send',
    act_init_done = 'act_init_done',
    act_send = 'act_send',
    act_sign = 'act_sign',
    act_pay = 'act_pay',
}

export enum EnumSalesKpiOpWorkStatus {
    op_status_in_work = 'op_status_in_work',
    op_status_in_long = 'op_status_in_long',
    op_status_success = 'op_status_success',
    op_status_in_progress = 'op_status_in_progress',
    op_status_money_await = 'op_status_money_await',
    op_status_fail = 'op_status_fail',
}

export enum EnumSalesKpiOpProspectStatus {
    op_prospects_good = 'op_prospects_good',
    op_prospects_nopersp = 'op_prospects_nopersp',
    op_prospects_garant = 'op_prospects_garant',
    op_prospects_go = 'op_prospects_go',
    op_prospects_territory = 'op_prospects_territory',
    op_prospects_acountant = 'op_prospects_acountant',
    op_prospects_autsorc = 'op_prospects_autsorc',
    op_prospects_depend = 'op_prospects_depend',
    op_prospects_nophone = 'op_prospects_nophone',
    op_prospects_company = 'op_prospects_company',
    op_prospects_fail = 'op_prospects_fail',
}
export enum EnumSalesKpiOpFailReason {
    fail_notime = 'fail_notime',
    c_habit = 'c_habit',
    c_prepay = 'c_prepay',
    c_price = 'c_price',
    to_expensive = 'to_expensive',
    to_cheap = 'to_cheap',
    nomoney = 'nomoney',
    noneed = 'noneed',
    lpr = 'lpr',
    employee = 'employee',
    fail_off = 'fail_off',
}

export enum EnumSalesKpiOpResultStatus {
    op_call_result_yes = 'op_call_result_yes',
    op_call_result_no = 'op_call_result_no',
}
export enum EnumSalesKpiOpNoresultReason {
    secretar = 'secretar',
    nopickup = 'nopickup',
    nonumber = 'nonumber',
    busy = 'busy',
    noresult_notime = 'noresult_notime',
    nocontact = 'nocontact',
    giveup = 'giveup',
    bay = 'bay',
    wrong = 'wrong',
    auto = 'auto',
}
