import { PbxSalesKpiListFieldItemCode } from '@/modules/pbx-sales-kpi-list/type/pbx-sales-kpi-list-field.type';
import { PbxSalesEventFieldItemCode } from '@/modules/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';

/**
 * Payload одного KPI-/History-элемента в логических кодах
 * (без привязки к bitrixId конкретного портала).
 *
 * Модель `KpiEventItemModel` сама подставит правильные `PROPERTY_*` / item-id
 * по {@link IPBXList}.
 */
export interface KpiEventPayload {
    /** Значение поля NAME элемента списка */
    name: string;

    /** Скалярные значения полей (даты, employee-id, crm, комментарий и т.п.) */
    values: KpiEventScalarValues;

    /** Поля-перечисления, передаются как короткие коды item */
    items: KpiEventItemCodes;
}

export interface KpiEventScalarValues {
    /** sales_kpi_event_date — дата события (момент записи) */
    event_date?: string;

    /** sales_kpi_event_title — заголовок события */
    event_title?: string;

    /** sales_kpi_plan_date — дата следующей коммуникации */
    plan_date?: string | null;

    /** sales_kpi_author */
    author?: string | number;

    /** sales_kpi_responsible */
    responsible?: string | number;

    /** sales_kpi_su — соисполнитель */
    su?: string | number;

    /** sales_kpi_crm — мапа `{ n0: 'CO_1', n1: 'D_2', ... }` */
    crm?: Record<string, string>;

    /** sales_kpi_crm_company */
    crm_company?: Record<string, string>;

    /** sales_kpi_crm_contact */
    crm_contact?: Record<string, string>;

    /** sales_kpi_manager_comment */
    manager_comment?: string;
}

/**
 * Item codes для enumeration-полей KPI/History элемента.
 *
 * Все типы выведены из `PBX_SALES_KPI_LIST_FIELDS` / `PBX_SALES_EVENT_FIELDS`
 * — никаких magic-строк. TS отловит опечатку на этапе компиляции.
 *
 * NB: `op_prospects_type` живёт в event-fields (не в kpi-list-fields), потому
 * что это одно и то же портальное enumeration, переиспользуемое в нескольких
 * сущностях; берём литералы оттуда.
 */
export interface KpiEventItemCodes {
    /** event_type: 'xo' | 'call' | 'presentation' | 'info' | ... */
    event_type?: PbxSalesKpiListFieldItemCode<'event_type'>;

    /** event_action: 'plan' | 'done' | 'expired' | 'pound' */
    event_action?: PbxSalesKpiListFieldItemCode<'event_action'>;

    /** op_result_status: 'op_call_result_yes' | 'op_call_result_no' */
    op_result_status?: PbxSalesKpiListFieldItemCode<'op_result_status'>;

    /** op_noresult_reason: 'secretar' | 'nopickup' | 'busy' | ... */
    op_noresult_reason?: PbxSalesKpiListFieldItemCode<'op_noresult_reason'>;

    /** op_work_status: 'op_status_in_work' | 'op_status_fail' | ... */
    op_work_status?: PbxSalesKpiListFieldItemCode<'op_work_status'>;

    /** op_fail_type: 'garant' | 'go' | 'failure' | ... */
    op_fail_type?: PbxSalesKpiListFieldItemCode<'op_fail_type'>;

    /** op_fail_reason: 'fail_notime' | 'nomoney' | ... */
    op_fail_reason?: PbxSalesKpiListFieldItemCode<'op_fail_reason'>;

    /** op_prospects_type: 'op_prospects_good' | 'op_prospects_nopersp' | ... */
    op_prospects_type?: PbxSalesEventFieldItemCode<'op_prospects_type'>;
}
