/**
 * Const-описание смарт-процесса «Звонки По решению» (ЗПР).
 *
 * Единственный источник правды о смарте (концепция —
 * front/docs/zpr-smart-concept.md, todo2508 №5): каждый запланированный
 * звонок по решению = ОДИН элемент смарта, со стадиями как у pres/xo-сделок,
 * связями с основной и презентационной сделками/лидом/компанией и
 * ИСТОРИЕЙ КОММЕНТАРИЕВ (что писали при планировании, при отчёте и между —
 * требование владельца). Спонтанные ЗПР — как спонтанные презентации.
 *
 * Идея зеркальна организации ХО/презентаций; следом тем же каркасом
 * планируется смарт презентаций (см. концепт-док).
 */

/** Типы полей повторяют PortalFieldType (mapFieldTypeToBitrixType). */
export type ZprFieldType =
    | 'string'
    | 'integer'
    | 'date'
    | 'datetime'
    | 'boolean'
    | 'enumeration'
    | 'employee'
    | 'crm';

export interface ZprSmartEnumItem {
    /** Код значения (xmlId в Bitrix). */
    CODE: string;
    VALUE: string;
    SORT: number;
}

export interface ZprSmartFieldDef {
    /** Код поля: суффикс UF-имени (UF_CRM_{typeId}_{code}) и xmlId. UPPER_SNAKE. */
    code: string;
    name: string;
    type: ZprFieldType;
    items?: readonly ZprSmartEnumItem[];
    isMultiple?: boolean;
    /** Для type='crm' — привязка к сущностям (без неё значения молча теряются). */
    crmEntities?: readonly ('LEAD' | 'DEAL' | 'CONTACT' | 'COMPANY')[];
}

export const ZPR_SMART_TYPE = 'zpr';
export const ZPR_SMART_GROUP = 'sales';
/** Ключ идемпотентности установки — менять только с переустановкой везде. */
export const ZPR_SMART_CODE = `${ZPR_SMART_TYPE}_${ZPR_SMART_GROUP}`;
export const ZPR_SMART_TITLE = 'Звонки По решению';

// ---------------------------------------------------------------------------
// Стадии (воронка одна, коды по конвенции pbx: `zpr_<suffix>`)
// ---------------------------------------------------------------------------

/**
 * Стадии — зеркало воронки презентаций: рабочие (план → перенос) и
 * закрывающие (успех + три отрицательных исхода).
 *
 * Разговор ДОШЁЛ и разговор НЕ дошёл — разные вещи для отчётности, и
 * закрывающих стадий поэтому три:
 *  - zpr_success — созвонились, работа продолжается (успех звонка).
 *    Что случится со сделкой дальше (продажа, отказ, «не ЦА») — вопрос
 *    к самой сделке: элемент привязан к ней родителем, и фильтр по
 *    родителю отвечает на него без дублирования стадий здесь;
 *  - zpr_result_fail — созвонились, и клиент отказал прямо в этом
 *    разговоре. Раньше такой звонок уезжал в «Состоялся» вместе с
 *    удачными, и «дозвонились и получили отказ» было не отличить от
 *    «дозвонились и работаем»;
 *  - zpr_noresult — не дозвонились (нерезультативный отчёт);
 *  - zpr_fail — план отменён, звонка не было вовсе.
 *
 * «Перенос» назван прямо (как pres_pending = «Презентация: Перенос»):
 * flow двигает сюда элемент при переносе задачи, а прежнее имя
 * «Ожидание» этого не показывало.
 */
export const ZPR_SMART_STAGES = [
    { code: 'zpr_plan', name: 'Запланирован', semantics: null, sort: 10 },
    { code: 'zpr_pending', name: 'ЗПР: Перенос', semantics: null, sort: 20 },
    {
        code: 'zpr_success',
        name: 'Состоялся: в работе',
        semantics: 'S',
        sort: 30,
    },
    {
        code: 'zpr_result_fail',
        name: 'Состоялся: отказ',
        semantics: 'F',
        sort: 40,
    },
    { code: 'zpr_noresult', name: 'Не состоялся', semantics: 'F', sort: 50 },
    { code: 'zpr_fail', name: 'Отменён', semantics: 'F', sort: 60 },
] as const;

// ---------------------------------------------------------------------------
// Возражения — стартовый набор = справочник причин отказа (op_efield_fail_*).
// Multiple: на ОДНОМ звонке возражений несколько; состав пополняется прямо
// на портале (фича обязана сканировать живые items, не только эти).
// ---------------------------------------------------------------------------

export const ZPR_OBJECTION_ITEMS: readonly ZprSmartEnumItem[] = [
    { CODE: 'zpr_obj_notime', VALUE: 'Не было времени', SORT: 10 },
    { CODE: 'zpr_obj_c_habit', VALUE: 'Конкуренты - привыкли', SORT: 20 },
    { CODE: 'zpr_obj_c_prepay', VALUE: 'Конкуренты - оплачено', SORT: 30 },
    { CODE: 'zpr_obj_c_price', VALUE: 'Конкуренты - цена', SORT: 40 },
    { CODE: 'zpr_obj_to_expensive', VALUE: 'Слишком дорого', SORT: 50 },
    { CODE: 'zpr_obj_to_cheap', VALUE: 'Слишком дешево', SORT: 60 },
    { CODE: 'zpr_obj_nomoney', VALUE: 'Нет денег', SORT: 70 },
    { CODE: 'zpr_obj_noneed', VALUE: 'Не видят надобности', SORT: 80 },
    { CODE: 'zpr_obj_lpr', VALUE: 'ЛПР против', SORT: 90 },
    { CODE: 'zpr_obj_employee', VALUE: 'Ключевой сотрудник против', SORT: 100 },
    { CODE: 'zpr_obj_off', VALUE: 'Не хотят общаться', SORT: 110 },
] as const;

// ---------------------------------------------------------------------------
// Поля элемента
// ---------------------------------------------------------------------------

export const ZPR_SMART_FIELDS: readonly ZprSmartFieldDef[] = [
    // === Связи (обязательный контур: без них элемент не найти из карточек) ===
    {
        code: 'ZPR_BASE_DEAL',
        name: 'Основная сделка',
        type: 'crm',
        crmEntities: ['DEAL'],
    },
    {
        code: 'ZPR_PRES_DEAL',
        name: 'Сделка презентации',
        type: 'crm',
        crmEntities: ['DEAL'],
    },
    {
        code: 'ZPR_LEAD',
        name: 'Лид/заявка',
        type: 'crm',
        crmEntities: ['LEAD'],
    },
    {
        code: 'ZPR_COMPANY',
        name: 'Компания',
        type: 'crm',
        crmEntities: ['COMPANY'],
    },
    {
        code: 'ZPR_CONTACT',
        name: 'Контакт разговора',
        type: 'crm',
        crmEntities: ['CONTACT'],
    },
    // «Полностью наш»: хоть одна ЗАЯВКА (лидоген) среди привязок.
    {
        code: 'ZPR_IS_OUR_REQUEST',
        name: 'Из заявки (полностью наш)',
        type: 'boolean',
    },

    // === Планирование / исполнение ===
    { code: 'ZPR_PLAN_DATE', name: 'Запланирован на', type: 'datetime' },
    { code: 'ZPR_DONE_DATE', name: 'Состоялся', type: 'datetime' },
    { code: 'ZPR_IS_SPONTANEOUS', name: 'Спонтанный', type: 'boolean' },
    // По стадии не восстановить, сколько раз звонок переносили (todo2508-02
    // №6) — счётчик инкрементится flow при каждом переносе.
    { code: 'ZPR_MOVE_COUNT', name: 'Количество переносов', type: 'integer' },
    { code: 'ZPR_RESPONSIBLE', name: 'Ответственный', type: 'employee' },

    // === Чек-листы решения (planning / reporting) ===
    {
        code: 'ZPR_DECISION_CALL_DATE',
        name: 'Дата звонка по решению',
        type: 'date',
    },
    {
        code: 'ZPR_DECISION_AGREEMENT',
        name: 'Согласование даты по решению',
        type: 'date',
    },
    {
        code: 'ZPR_OBJECTIONS',
        name: 'Возражения',
        type: 'enumeration',
        isMultiple: true,
        items: ZPR_OBJECTION_ITEMS,
    },

    // === История комментариев (требование владельца: план / отчёт / между) ===
    {
        code: 'ZPR_PLAN_COMMENT',
        name: 'Комментарий планирования',
        type: 'string',
    },
    { code: 'ZPR_REPORT_COMMENT', name: 'Комментарий отчёта', type: 'string' },
    {
        code: 'ZPR_COMMENTS',
        name: 'История комментариев',
        type: 'string',
        isMultiple: true,
    },

    // === Зеркала истории/дат из основной сделки (op_mhistory-контур) ===
    {
        code: 'ZPR_MHISTORY',
        name: 'История (зеркало сделки)',
        type: 'string',
        isMultiple: true,
    },
    {
        code: 'ZPR_LAST_CALL_DATE',
        name: 'Дата последнего звонка',
        type: 'datetime',
    },
    {
        code: 'ZPR_NEXT_CALL_DATE',
        name: 'Дата следующего звонка',
        type: 'datetime',
    },
] as const;

// ---------------------------------------------------------------------------
// Имена полей (канон СКАП: buildSkapUfName / buildSkapItemFieldName)
// ---------------------------------------------------------------------------

/**
 * UF-имя поля для userfieldconfig.*: UF_CRM_{typeId}_{code}.
 * typeId — id смарт-типа из crm.type.list (НЕ entityTypeId!).
 */
export function buildZprUfName(typeId: number | string, code: string): string {
    return `UF_CRM_${typeId}_${code}`;
}

/**
 * ФОРМУЛЬНОЕ имя поля в crm.item.* API: camelCase от UF-имени
 * (UF_CRM_7_ZPR_BASE_DEAL → ufCrm7ZprBaseDeal). Фактический ключ может
 * отличаться (инцидент UF_CRM_94_TRANSCRIPT_1) — установщик сверяет
 * формулу с crm.item.fields и пишет в зеркало фактическое значение.
 */
export function buildZprItemFieldName(
    typeId: number | string,
    code: string,
): string {
    const pascal = code
        .toLowerCase()
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    return `ufCrm${typeId}${pascal}`;
}

/**
 * Суффикс STATUS_ID стадии по коду шаблона: 'zpr_plan' → 'PLAN'.
 * Полный STATUS_ID собирает стратегия смартов:
 * DT{entityTypeId}_{bxCategoryId}:{суффикс}.
 */
export function zprStageBitrixId(stageCode: string): string {
    return stageCode.replace(/^zpr_/, '').toUpperCase();
}
