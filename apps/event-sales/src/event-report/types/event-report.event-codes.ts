import { PbxSalesKpiListFieldItemCode } from '@/modules/pbx-sales-kpi-list/type/pbx-sales-kpi-list-field.type';
import { PbxSalesEventFieldItemCode } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';

/**
 * Алиасы типов item-кодов для удобства внутри event-report.
 * Все коды выведены из портальных констант — TS отловит опечатки.
 */
export type EventTypeCode = PbxSalesKpiListFieldItemCode<'event_type'>;
export type EventActionCode = PbxSalesKpiListFieldItemCode<'event_action'>;
export type OpResultStatusCode =
    PbxSalesKpiListFieldItemCode<'op_result_status'>;
export type OpNoresultReasonCode =
    PbxSalesKpiListFieldItemCode<'op_noresult_reason'>;
export type OpWorkStatusCode = PbxSalesKpiListFieldItemCode<'op_work_status'>;
export type OpFailTypeCode = PbxSalesKpiListFieldItemCode<'op_fail_type'>;
export type OpFailReasonCode = PbxSalesKpiListFieldItemCode<'op_fail_reason'>;
export type OpProspectsTypeCode =
    PbxSalesEventFieldItemCode<'op_prospects_type'>;

/**
 * Тип события из задачи (`currentTask.eventType`) и плана (`plan.type.current.code`).
 *
 * NB: значения совпадают с item-кодами `event_type` KPI-списка для тех, что
 * там перечислены (xo / presentation / call). Часть значений (warm, hot,
 * moneyAwait, supply, document) живёт только в DTO/бизнес-логике расчёта
 * стадий — сюда добавляются как литералы и проверяются через
 * exhaustiveness в switch'ах.
 */
export const EVENT_REPORT_EVENT_TYPE = {
    xo: 'xo',
    warm: 'warm',
    presentation: 'presentation',
    hot: 'hot',
    moneyAwait: 'moneyAwait',
    supply: 'supply',
    document: 'document',
} as const;

export type EventReportEventType =
    (typeof EVENT_REPORT_EVENT_TYPE)[keyof typeof EVENT_REPORT_EVENT_TYPE];

/**
 * Событие действия — пришедшее из DTO. Не путать с
 * `PbxSalesKpiListFieldItemCode<'event_action'>` (это бит-кодов в Bitrix).
 */
export const EVENT_REPORT_ACTION = {
    plan: 'plan',
    done: 'done',
    expired: 'expired',
    fail: 'fail',
    success: 'success',
    new: 'new',
    cancel: 'cancel',
    noresult: 'noresult',
    pound: 'pound',
} as const;

export type EventReportAction =
    (typeof EVENT_REPORT_ACTION)[keyof typeof EVENT_REPORT_ACTION];

/**
 * Домен gsirk-портала — несколько post-flow сервисов работают только для него.
 */
export const GSIRK_DOMAIN = 'gsirk.bitrix24.ru' as const;
export type GsirkDomain = typeof GSIRK_DOMAIN;
