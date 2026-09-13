import {
    PbxSalesEventFieldCode,
    PbxSalesEventFieldItemCode,
} from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';

/**
 * Тотальная типизация СОБЫТИЙНЫХ полей холодного обзвона — набора, который
 * классический ХО пишет на каждую участвующую сущность (компания/лид/сделка
 * ОП/сделка ХО): «когда обзвон, кто ответственный, что за событие, история».
 *
 * Здесь только КОДЫ и их принадлежность сущностям; расчёт значений — в
 * моделях хука (XoEventEntityModel и наследники). Значения кодов сверяются
 * с `PBX_SALES_EVENT_FIELDS` compile-time стражем внизу файла: опечатка или
 * рассинхрон со справочником не соберётся.
 */
export enum EnumXoEventFieldCode {
    /** Название события ХО. */
    xoName = 'xo_name',
    /** Дата/время запланированного обзвона. */
    xoDate = 'xo_date',
    /** Ответственный за обзвон. */
    xoResponsible = 'xo_responsible',
    /** Постановщик обзвона (кто инициировал). */
    xoCreated = 'xo_created',
    /** Менеджер ОП, ведущий клиента. */
    managerOp = 'manager_op',
    /** Дата следующего события. */
    callNextDate = 'call_next_date',
    /** Название следующего события. */
    callNextName = 'call_next_name',
    /** Дата последнего события. */
    callLastDate = 'call_last_date',
    /** История работы строкой (накопительная). */
    opHistory = 'op_history',
    /** История работы списком (multiple, свежая запись первой). */
    opMHistory = 'op_mhistory',
    /** Текущий статус работы (человекочитаемое название события). */
    opCurrentStatus = 'op_current_status',
    /** Статус работы (enum: в работе / отложено / …). */
    opWorkStatus = 'op_work_status',
    /** Тип перспективности клиента (enum). */
    opProspectsType = 'op_prospects_type',
}

/** Runtime-порядок применения (совпадает с порядком записи в Bitrix). */
export const XO_EVENT_FIELD_CODES = Object.values(EnumXoEventFieldCode);

/**
 * Поля МАРШРУТИЗАЦИИ ХО — их заполняет РОБОТ Битрикса ПЕРЕД тем, как
 * поставить элемент в очередь и дёрнуть хук; бэкенд их только ЧИТАЕТ.
 *
 * Набор отдельный от {@link XO_EVENT_FIELD_CODES} намеренно: тот перечисляет
 * то, что ХО-хук ПИШЕТ (и цикл записи в XoEventEntityModel идёт ровно по
 * нему) — добавить сюда код значит потребовать для него ветку записи.
 *
 * Пара «кому» обязательна ХОТЯ БЫ одной половиной, иначе назначать некому:
 *  - `responsible` — конкретный сотрудник, round-robin не нужен;
 *  - `department` — строка-подсказка, в каком ОП крутить round-robin
 *    (сравнение нестрогое, по вхождению — см. LeadToWorkAssigneeService).
 * Остальное необязательно и имеет дефолты в хуке: без `name` берётся
 * название сущности, без `date` задача ставится без дедлайна.
 *
 * Читается и очередью ХО из лидов, и реанимацией отказников из сделок
 * (там робот снимает сотрудника, оставляя отдел), поэтому коды общие.
 */
export const XO_ROUTING_FIELD_CODES = {
    /** Явный ответственный ХО (`employee`). */
    responsible: EnumXoEventFieldCode.xoResponsible,
    /** Отдел строкой — подсказка для round-robin (`string`). */
    department: 'department_string',
    /** Название события ХО → имя задачи/события (`string`). */
    name: EnumXoEventFieldCode.xoName,
    /** Плановая дата обзвона → дедлайн задачи (`datetime`). */
    date: EnumXoEventFieldCode.xoDate,
    /** Постановщик ХО — автор события (`employee`). */
    created: EnumXoEventFieldCode.xoCreated,
} as const satisfies Record<string, PbxSalesEventFieldCode>;

/**
 * Поля НАМЕРЕНИЯ ХУКА — «какой сценарий запустил робот». Их, как и
 * {@link XO_ROUTING_FIELD_CODES}, робот пишет в карточку ПЕРЕД вызовом
 * хука, а бэкенд только читает.
 *
 * Отдельный набор от маршрутизации намеренно: маршрутизация отвечает на
 * вопрос «КОМУ и КОГДА», эта — на «КАК обрабатывать». Разница практическая:
 * без маршрутизации элемент назначать некому и он ждёт ручного разбора
 * ({@link XoRoutingModel.isReady}), а намерение необязательно всё —
 * у каждого флага есть дефолт.
 *
 * ЗАЧЕМ ДУБЛИРОВАТЬ query-параметры хука полями. Query живёт ровно один
 * вызов. Подстраховка (крон, который досылает «недоехавшие» элементы по
 * маркерам `op_xo_revive_*`) по нему сценарий восстановить не может и
 * досылала бы с дефолтами вместо того, что задумал робот — то есть тихо
 * меняла бы поведение. В карточке намерение переживает и падение хука, и
 * перезапуск, и разбор руками.
 */
export const XO_INTENT_FIELD_CODES = {
    /** Режим стадии сделки: `cold` | `new`; пусто → `cold` (`string`). */
    stageMode: 'op_xo_lead_stage_mode',
    /** Ставить ХО-сделку и звать задачу «Холодный обзвон» (`boolean`). */
    isXo: 'op_xo_is_xo',
    /** Забрать клиента у другого сотрудника (`boolean`). */
    isForce: 'op_xo_is_force',
} as const satisfies Record<string, PbxSalesEventFieldCode>;

/** Значения `op_xo_lead_stage_mode`. */
export const XO_STAGE_MODES = ['cold', 'new'] as const;
export type XoStageMode = (typeof XO_STAGE_MODES)[number];

/**
 * Режим, в который уходит работа, когда поле не заполнено И заявка с сайта
 * не подтверждена. «Холодная» — безопасная сторона ошибки: клиент попадёт
 * в холодный цикл, а не в начало воронки продаж.
 */
export const XO_STAGE_MODE_DEFAULT: XoStageMode = 'cold';

/**
 * Разбор ЗНАЧЕНИЯ поля `op_xo_lead_stage_mode`.
 *
 * @returns null, когда поле пустое ИЛИ содержит неизвестное значение —
 *   отличать «робот не сказал» от «робот сказал cold» обязательно, иначе
 *   политику {@link resolveXoStageMode} не применить.
 */
export function toXoStageMode(raw: string | null): XoStageMode | null {
    const text = (raw ?? '').trim().toLowerCase();
    return (XO_STAGE_MODES as readonly string[]).includes(text)
        ? (text as XoStageMode)
        : null;
}

/**
 * ПОЛИТИКА режима стадии: «`new` — только подтверждённая заявка с сайта»
 * (решение владельца 12.09.2026).
 *
 * `new` ставит работу в начало воронки продаж, и попасть туда «лишним»
 * нельзя — нужно ПОДТВЕРЖДЕНИЕ, что клиент действительно оставил заявку.
 * Поэтому дефолт односторонний: не подтвердили — `cold`.
 *
 * Подтверждение берётся из двух независимых источников, и полагаться
 * только на первый нельзя — робот Битрикса поле может не заполнить
 * (старый шаблон, сбой БП, ручное создание лида), а безотказность это
 * наша задача, не его:
 *
 *  1. поле `op_xo_lead_stage_mode`, если робот его заполнил, — прямое
 *     указание и оно главнее;
 *  2. иначе — признак заявки по данным самого лида (детектор вида работы:
 *     наше поле `op_lead_work_kind`, поля лидогена, метки пути).
 *
 * ВХОДЯЩЕЕ ОБРАЩЕНИЕ (вид `lead` — звонок, письмо, чат) заявкой с сайта
 * НЕ считается и уходит в `cold`: клиент обратился сам, но заявки не
 * оставлял, и предметного разговора для начала воронки ещё нет.
 *
 * @param fieldValue сырое значение поля (`null` — поля нет/пусто)
 * @param isSiteRequest подтверждена ли заявка с сайта по данным лида
 */
export function resolveXoStageMode(
    fieldValue: string | null,
    isSiteRequest: boolean,
): XoStageMode {
    return (
        toXoStageMode(fieldValue) ??
        (isSiteRequest ? 'new' : XO_STAGE_MODE_DEFAULT)
    );
}

/**
 * Значение `op_work_status`, которое ХО ставит клиенту: «В работе».
 *
 * Item-код справочника ПОЛЯ КАРТОЧКИ (`PBX_SALES_EVENT_FIELDS`), а не
 * одноимённого поля KPI-списка (там этот же статус зовётся
 * `op_status_in_work`). Тип-страж не даст разъехаться со справочником.
 */
export const XO_EVENT_WORK_STATUS_ITEM_CODE: PbxSalesEventFieldItemCode<'op_work_status'> =
    'work';

/** Значение `op_prospects_type` по умолчанию для ХО: «Перспективная». */
export const XO_EVENT_PROSPECTS_ITEM_NAME = 'Перспективная';

/* ------------------------------------------------------------------ *
 * Compile-time страж: коды ⊆ PBX_SALES_EVENT_FIELDS.
 * ------------------------------------------------------------------ */

type AssertSubset<T extends U, U> = T;

export type _XoEventFieldCodesAreValid = AssertSubset<
    `${EnumXoEventFieldCode}`,
    PbxSalesEventFieldCode
>;
