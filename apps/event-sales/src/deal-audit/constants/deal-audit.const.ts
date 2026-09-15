import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    PBX_SALES_EVENT_FIELD_CODES,
    PbxSalesEventFieldItemCode,
} from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';

/**
 * Коды полей аудита в реестре pbx (`PBX_SALES_EVENT_FIELDS`).
 *
 * Берутся из реестра, а не пишутся строками: опечатка станет ошибкой
 * компиляции, а не молчаливым пропуском записи (ai/rules/pbx-typing.md).
 */
export const DEAL_AUDIT_FIELD_CODES = {
    status: PBX_SALES_EVENT_FIELD_CODES.op_audit_status,
    flags: PBX_SALES_EVENT_FIELD_CODES.op_audit_flags,
    auditedAt: PBX_SALES_EVENT_FIELD_CODES.op_audit_at,
    idleDays: PBX_SALES_EVENT_FIELD_CODES.op_audit_idle_days,
    overdueDays: PBX_SALES_EVENT_FIELD_CODES.op_audit_overdue_days,
    stageDays: PBX_SALES_EVENT_FIELD_CODES.op_audit_stage_days,
    openTasks: PBX_SALES_EVENT_FIELD_CODES.op_audit_open_tasks,
    comment: PBX_SALES_EVENT_FIELD_CODES.op_audit_comment,
} as const;

/** Item-код справочника «ОП Аудит: статус». */
export type DealAuditStatusCode = PbxSalesEventFieldItemCode<'op_audit_status'>;
/** Item-код справочника «ОП Аудит: признаки». */
export type DealAuditFlagCode = PbxSalesEventFieldItemCode<'op_audit_flags'>;

/** Статусы аудита — один «худший» признак сделки. */
export const DEAL_AUDIT_STATUS = {
    ok: 'op_audit_status_ok',
    noTask: 'op_audit_status_no_task',
    taskOverdue: 'op_audit_status_task_overdue',
    idle: 'op_audit_status_idle',
    stageStuck: 'op_audit_status_stage_stuck',
    forgotClose: 'op_audit_status_forgot_close',
} as const satisfies Record<string, DealAuditStatusCode>;

/** Признаки аудита — все сработавшие условия сразу. */
export const DEAL_AUDIT_FLAG = {
    noTask: 'op_audit_flag_no_task',
    taskOverdue: 'op_audit_flag_task_overdue',
    taskNoDeadline: 'op_audit_flag_task_no_deadline',
    nextDateEmpty: 'op_audit_flag_next_date_empty',
    nextDatePast: 'op_audit_flag_next_date_past',
    idle: 'op_audit_flag_idle',
    stageStuck: 'op_audit_flag_stage_stuck',
    forgotClose: 'op_audit_flag_forgot_close',
    noResponsible: 'op_audit_flag_no_responsible',
} as const satisfies Record<string, DealAuditFlagCode>;

/**
 * Приоритет признаков для выбора ОДНОГО статуса: чем раньше в списке,
 * тем хуже. Порядок — не вкусовой:
 *  1. «забыли закрыть» — сделка на последних стадиях, деньги ждут решения;
 *  2. «без задач» — к такой сделке никто и никогда не вернётся сам;
 *  3. «просрочена задача» — работа хотя бы висит в счётчиках менеджера;
 *  4. «давно нет работы», 5. «застряла» — фон, полезен на дистанции.
 */
export const DEAL_AUDIT_STATUS_PRIORITY: readonly {
    flag: DealAuditFlagCode;
    status: DealAuditStatusCode;
}[] = [
    {
        flag: DEAL_AUDIT_FLAG.forgotClose,
        status: DEAL_AUDIT_STATUS.forgotClose,
    },
    { flag: DEAL_AUDIT_FLAG.noTask, status: DEAL_AUDIT_STATUS.noTask },
    {
        flag: DEAL_AUDIT_FLAG.taskOverdue,
        status: DEAL_AUDIT_STATUS.taskOverdue,
    },
    { flag: DEAL_AUDIT_FLAG.idle, status: DEAL_AUDIT_STATUS.idle },
    { flag: DEAL_AUDIT_FLAG.stageStuck, status: DEAL_AUDIT_STATUS.stageStuck },
];

/**
 * Стадии, на которых решение клиента уже должно было состояться: сделка
 * висит здесь без работы — значит её забыли перевести в продажу или отказ.
 *
 * «Доработка» и «Презентация» сюда НЕ входят: там пауза законна (ждём
 * реквизиты, согласовываем дату) и признак давал бы ложную тревогу.
 */
export const DEAL_AUDIT_PRE_CLOSE_STAGES = [
    PBX_DEAL_SALES_BASE_STAGE_CODE.documentSend,
    PBX_DEAL_SALES_BASE_STAGE_CODE.inProgress,
    PBX_DEAL_SALES_BASE_STAGE_CODE.moneyAwait,
    PBX_DEAL_SALES_BASE_STAGE_CODE.supply,
] as const;

/** Русские подписи признаков — для расшифровки в карточке и в логе. */
export const DEAL_AUDIT_FLAG_LABEL: Record<DealAuditFlagCode, string> = {
    [DEAL_AUDIT_FLAG.noTask]: 'без задач',
    [DEAL_AUDIT_FLAG.taskOverdue]: 'просрочена задача',
    [DEAL_AUDIT_FLAG.taskNoDeadline]: 'задача без дедлайна',
    [DEAL_AUDIT_FLAG.nextDateEmpty]: 'нет даты следующего звонка',
    [DEAL_AUDIT_FLAG.nextDatePast]: 'дата следующего звонка в прошлом',
    [DEAL_AUDIT_FLAG.idle]: 'давно нет работы',
    [DEAL_AUDIT_FLAG.stageStuck]: 'застряла в стадии',
    [DEAL_AUDIT_FLAG.forgotClose]: 'забыли закрыть',
    [DEAL_AUDIT_FLAG.noResponsible]: 'нет ответственного',
};

/** Ключ Redis-лока тика (один процесс на кластер). */
export const DEAL_AUDIT_LOCK_KEY = 'event-sales:deal-audit-lock';
/** TTL лока: прогон по домену длинный (тысячи сделок + задачи). */
export const DEAL_AUDIT_LOCK_TTL_SEC = 25 * 60;

/** Метка последнего прогона домена — по ней работает интервал из админки. */
export const buildDealAuditLastRunKey = (domain: string): string =>
    `event-sales:deal-audit:last-run:${domain}`;
