import { PbxSalesKpiListFieldItemCode } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list-field.type';
import { PbxSalesEventFieldItemCode } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import {
    LEAD_WORK_KIND,
    LeadWorkKind,
} from '../../shared/event-title/types/cold-work-kind';

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
 *
 * Холодная работа разделена на три типа (см. {@link COLD_EVENT_TYPES}):
 * `xo` — настоящий холодный обзвон (клиент нас не ждёт), `xoRequest` —
 * заявка, `xoLead` — входящий лид/обращение. По воронке они ходят одинаково
 * (стадия «Холодная», воронка ХО), а в KPI пишутся разными кодами события.
 *
 * Вид холодной работы определяется В БИТРИКСЕ и приезжает СЛОВОМ В ЗАГОЛОВКЕ
 * задачи — «Холодный звонок. Заявка …» / «Холодный звонок. Лид …» / просто
 * «Холодный звонок …». Фронт парсит заголовок и шлёт готовый код обратно;
 * бэк по данным лида вид не угадывает (см. LEAD_WORK_KIND в lead-to-work).
 */
export const EVENT_REPORT_EVENT_TYPE = {
    xo: 'xo',
    xoRequest: 'xoRequest',
    xoLead: 'xoLead',
    warm: 'warm',
    presentation: 'presentation',
    hot: 'hot',
    /** Доработка: клиент дорабатывается после решения. */
    refine: 'refine',
    moneyAwait: 'moneyAwait',
    supply: 'supply',
    document: 'document',
} as const;

export type EventReportEventType =
    (typeof EVENT_REPORT_EVENT_TYPE)[keyof typeof EVENT_REPORT_EVENT_TYPE];

/**
 * «Холодные» типы события — те, что живут на холодной стадии воронки и в
 * воронке ХО. Разные по смыслу разговора, одинаковые по движению сделки,
 * поэтому лестница стадий и цепочка ХО работают по этому набору, а не по
 * литералу `'xo'`.
 */
export const COLD_EVENT_TYPES = [
    EVENT_REPORT_EVENT_TYPE.xo,
    EVENT_REPORT_EVENT_TYPE.xoRequest,
    EVENT_REPORT_EVENT_TYPE.xoLead,
] as const;

export type ColdEventType = (typeof COLD_EVENT_TYPES)[number];

/**
 * Холодный тип события → вид холодной работы (слово в заголовке задачи).
 * Общий словарь с хуком «лид → работа»: заголовок обязан читаться фронтом
 * одинаково, кем бы задача ни была создана.
 */
export const COLD_EVENT_TYPE_TO_WORK_KIND: Record<ColdEventType, LeadWorkKind> =
    {
        xo: LEAD_WORK_KIND.cold,
        xoRequest: LEAD_WORK_KIND.request,
        xoLead: LEAD_WORK_KIND.lead,
    };

/** Холодный ли это тип события (ХО / заявка / входящий лид). */
export const isColdEventType = (
    type: EventReportEventType | null | undefined,
): type is ColdEventType =>
    !!type && (COLD_EVENT_TYPES as readonly string[]).includes(type);

/**
 * Человекочитаемые названия типов события — для таймлайна и логов. Раньше в
 * историю попадал сырой код (`xo`, `moneyAwait`), и запись читалась только
 * разработчиком.
 */
export const EVENT_REPORT_EVENT_TYPE_NAME: Record<
    EventReportEventType,
    string
> = {
    xo: 'Холодный звонок',
    xoRequest: 'Заявка',
    xoLead: 'Лид',
    warm: 'Звонок',
    presentation: 'Презентация',
    hot: 'Звонок по решению',
    refine: 'Доработка',
    moneyAwait: 'Звонок по оплате',
    supply: 'Поставка',
    document: 'Документы',
};

/** Название типа события; неизвестный код возвращается как есть. */
export const eventTypeName = (type: string): string =>
    EVENT_REPORT_EVENT_TYPE_NAME[type as EventReportEventType] ?? type;

/**
 * Состоявшееся событие → фраза с согласованным по роду глаголом
 * («Звонок совершён», «Презентация проведена») — для истории карточки и
 * таймлайна. Слово «Отчёт» в записях не используется.
 */
export const EVENT_REPORT_EVENT_DONE_PHRASE: Record<
    EventReportEventType,
    string
> = {
    xo: 'Холодный звонок совершён',
    xoRequest: 'Заявка отработана',
    xoLead: 'Лид отработан',
    warm: 'Звонок совершён',
    presentation: 'Презентация проведена',
    hot: 'Звонок по решению совершён',
    refine: 'Доработка проведена',
    moneyAwait: 'Звонок по оплате совершён',
    supply: 'Поставка выполнена',
    document: 'Документы отработаны',
};

/**
 * Запланированное событие → фраза с согласованным по роду причастием
 * («Запланирован Звонок», «Запланирована Презентация»). Дата плана
 * добавляется вызывающим («… на 28 мая 14:30»).
 */
export const EVENT_REPORT_EVENT_PLAN_PHRASE: Record<
    EventReportEventType,
    string
> = {
    xo: 'Запланирован Холодный звонок',
    xoRequest: 'Запланирована работа по заявке',
    xoLead: 'Запланирована работа по лиду',
    warm: 'Запланирован Звонок',
    presentation: 'Запланирована Презентация',
    hot: 'Запланирован Звонок по решению',
    refine: 'Запланирована Доработка',
    moneyAwait: 'Запланирован Звонок по оплате',
    supply: 'Запланирована Поставка',
    document: 'Запланирована работа по документам',
};

/** Фраза состоявшегося события; неизвестный код — русское название типа. */
export const eventDonePhrase = (type: string): string =>
    EVENT_REPORT_EVENT_DONE_PHRASE[type as EventReportEventType] ??
    eventTypeName(type);

/** Фраза плана; неизвестный код — «Запланировано: <название типа>». */
export const eventPlanPhrase = (type: string): string =>
    EVENT_REPORT_EVENT_PLAN_PHRASE[type as EventReportEventType] ??
    `Запланировано: ${eventTypeName(type)}`;

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
