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
} as const satisfies Record<string, PbxSalesEventFieldCode>;

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
