/**
 * Истинная типизация ПЛАНОВЫХ user-полей сотрудника (планы руководителя).
 *
 * НЕ путать с kpi-«планами» (`call_plan` и т.п.) — те считают CRM-задачи
 * «менеджер запланировал звонок». Здесь — целевые значения (targets),
 * которые руководитель устанавливает сотруднику; хранятся в Bitrix
 * user-полях `UF_USR_<user>` (маркер-неймспейс A_SALES_PLAN_).
 *
 * `code` — семантический код показателя (единый с каталогом plans в
 * kpi-report-sales); `user` — суффикс имени Bitrix-поля (полное имя
 * UF_USR_A_SALES_PLAN_*). Значения целые (integer): штуки, рубли, минуты.
 */
import { createEnumObject } from '../../pbx-field-type.util';

export const PBX_SALES_USER_PLAN_FIELDS = [
    {
        name: 'План: Звонки',
        type: 'integer',
        code: 'calls_done',
        user: 'A_SALES_PLAN_CALLS_DONE',
        order: 510,
    },
    {
        name: 'План: Презентации',
        type: 'integer',
        code: 'presentations_done',
        user: 'A_SALES_PLAN_PRESENTATIONS_DONE',
        order: 520,
    },
    {
        name: 'План: КП',
        type: 'integer',
        code: 'offers_sent',
        user: 'A_SALES_PLAN_OFFERS_SENT',
        order: 530,
    },
    {
        name: 'План: Счета',
        type: 'integer',
        code: 'invoices_sent',
        user: 'A_SALES_PLAN_INVOICES_SENT',
        order: 540,
    },
    {
        name: 'План: Продажи (шт)',
        type: 'integer',
        code: 'sales_count',
        user: 'A_SALES_PLAN_SALES_COUNT',
        order: 550,
    },
    {
        name: 'План: Месячная сумма продаж',
        type: 'integer',
        code: 'sales_monthly_amount',
        user: 'A_SALES_PLAN_SALES_MONTHLY',
        order: 560,
    },
    {
        name: 'План: Аванс',
        type: 'integer',
        code: 'advance_amount',
        user: 'A_SALES_PLAN_ADVANCE',
        order: 570,
    },
    {
        name: 'План: Эфирное время (мин)',
        type: 'integer',
        code: 'airtime_minutes',
        user: 'A_SALES_PLAN_AIRTIME_MIN',
        order: 580,
    },
    {
        name: 'План: Звонки > 30 сек',
        type: 'integer',
        code: 'calls_over_30s',
        user: 'A_SALES_PLAN_CALLS_OVER_30',
        order: 590,
    },
    {
        name: 'План: Звонки > 60 сек',
        type: 'integer',
        code: 'calls_over_60s',
        user: 'A_SALES_PLAN_CALLS_OVER_60',
        order: 600,
    },
] as const;

export type PbxSalesUserPlanField = (typeof PBX_SALES_USER_PLAN_FIELDS)[number];
export type PbxSalesUserPlanFieldCode = PbxSalesUserPlanField['code'];
/** Суффикс имени Bitrix user-поля (полное имя = UF_USR_ + suffix). */
export type PbxSalesUserPlanFieldName = PbxSalesUserPlanField['user'];

export const PBX_SALES_USER_PLAN_FIELD_CODES = Object.freeze(
    createEnumObject(
        PBX_SALES_USER_PLAN_FIELDS.map(
            field => field.code,
        ) as readonly PbxSalesUserPlanFieldCode[],
    ),
);

/** Поле по коду показателя (в тестах/каталогах обязано находиться). */
export const findPbxSalesUserPlanField = (
    code: string,
): PbxSalesUserPlanField | undefined =>
    PBX_SALES_USER_PLAN_FIELDS.find(field => field.code === code);
