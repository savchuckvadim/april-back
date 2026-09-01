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
/**
 * Форма записи стадии. Ровно как у {@link ZprSmartFieldDef}: объявление
 * ниже идёт `as const satisfies`, поэтому коды остаются литералами (из них
 * выводится {@link ZprSmartStageCode}), но кривая запись — опечатка в
 * semantics, забытый sort — ловится на компиляции, а не на портале.
 */
export interface ZprSmartStageDef {
    code: string;
    name: string;
    /** Закрывающая семантика Bitrix: 'S' — успех, 'F' — провал, null — рабочая. */
    semantics: 'S' | 'F' | null;
    sort: number;
}

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
] as const satisfies readonly ZprSmartStageDef[];

/**
 * Код стадии ЗПР — все обращения flow типизированы этим union (зеркало
 * {@link ZprSmartFieldCode} и PresentationSmartStageCode).
 *
 * Выводится ИЗ самого списка стадий, второго перечня кодов не заводим:
 * добавили стадию в ZPR_SMART_STAGES — union расширился сам. Без этого
 * `stageIdByCode` был `Record<string, string>`: редактор не подсказывал
 * коды, а опечатка (`zpr_pendin`) доезжала до рантайма как `undefined`
 * и молча роняла запись стадии.
 */
export type ZprSmartStageCode = (typeof ZPR_SMART_STAGES)[number]['code'];

// ---------------------------------------------------------------------------
// Возражения.
//
// Возражение возникает на ЛЮБОМ этапе работы и на любом может стать
// причиной отказа (уточнение владельца 27.08) — значит оно принадлежит
// КЛИЕНТУ, а не этапу. Поле-истина живёт на сущностях: `op_objection_reason`
// + `op_objection_comment` (лид, компания, сделка); там же его пишет
// анкета отчёта по доработке и по решению.
//
// Здесь, в элементе смарта, — СНИМОК на момент этого звонка: с чем
// работали в разговоре. Состав значений намеренно тот же, что у причин
// отказа: возражение и есть «мини-отказ», и разводить два справочника
// одного смысла нельзя — иначе одно и то же придётся сводить руками.
// Состав пополняется прямо на портале (фича обязана сканировать живые
// items, не только эти).
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

/**
 * Поля элемента ЗПР.
 *
 * Объявление `as const satisfies` (зеркало PRESENTATION_SMART_FIELDS):
 * коды остаются литералами и из них выводится {@link ZprSmartFieldCode} —
 * запись в несуществующее поле не компилируется. Раньше здесь стояла
 * аннотация типа, коды схлопывались в string, и опечатка в имени поля
 * доезжала бы до портала молчаливым пропуском.
 */
export const ZPR_SMART_FIELDS = [
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

    // === Снимок клиента на момент звонка (карта ZPR_SMART_SURVEY_MIRROR) ===
    {
        /*
         * Сводный «Хвост» и сводные «Пять К» — требование владельца
         * 01.09.2026: запланировали ЗПР и в том же отчёте отчитались по
         * презентации — собранный отчёт обязан приехать в элемент ЗПР.
         *
         * Только СВОДКИ, без разбивки по блокам: детализация по полям живёт
         * в элементе презентации, а звонку по решению нужен итог одной
         * строкой — что осталось «хвостом» и что выяснили по пяти «К».
         */
        code: 'ZPR_XVOST',
        name: 'Хвост (сводно)',
        type: 'string',
    },
    {
        code: 'ZPR_5K_SUMMARY',
        name: 'Пять К (сводно)',
        type: 'string',
    },
    {
        // Плановая дата покупки — требование владельца 31.08: элемент ЗПР
        // обязан нести её ВСЕГДА (звонок по решению и есть разговор о
        // покупке). Значение-истина живёт на сделке/компании
        // (op_sale_date_prognoz), сюда — снимок на момент звонка.
        code: 'ZPR_SALE_DATE_PROGNOZ',
        name: 'Плановая дата покупки',
        type: 'date',
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
] as const satisfies readonly ZprSmartFieldDef[];

/** Код поля смарта ЗПР — все записи flow типизированы этим union. */
export type ZprSmartFieldCode = (typeof ZPR_SMART_FIELDS)[number]['code'];

/**
 * Карта снимка клиента для элемента ЗПР: поле сущности → поле смарта
 * (зеркало PRESENTATION_SMART_SURVEY_MIRROR, тот же формат записи).
 *
 * `from` — где живёт значение-истина; порядок записей на один target —
 * порядок фолбэка (первое непустое побеждает): плановая дата покупки
 * лежит на СДЕЛКЕ и на КОМПАНИИ (на лиде поля нет — см. реестр
 * op_sale_date_prognoz), сделка точнее. Сводки анкеты лежат на сделке и
 * лиде; компании у них нет.
 */
export const ZPR_SMART_SURVEY_MIRROR = [
    {
        source: 'op_sale_date_prognoz',
        target: 'ZPR_SALE_DATE_PROGNOZ',
        from: 'deal',
    },
    {
        source: 'op_sale_date_prognoz',
        target: 'ZPR_SALE_DATE_PROGNOZ',
        from: 'company',
    },
    // Сводки анкеты: значение-истина на сделке, фолбэк — лид (компании у
    // этих полей нет, см. реестр op_presentation_*). Приоритетнее обоих —
    // payload ЭТОГО отчёта: анкету могли заполнить прямо сейчас, и в
    // прочитанной строке сделки лежит ещё прошлая сводка.
    {
        source: 'op_presentation_xvost',
        target: 'ZPR_XVOST',
        from: 'deal',
    },
    {
        source: 'op_presentation_xvost',
        target: 'ZPR_XVOST',
        from: 'lead',
    },
    {
        source: 'op_presentation_5k',
        target: 'ZPR_5K_SUMMARY',
        from: 'deal',
    },
    {
        source: 'op_presentation_5k',
        target: 'ZPR_5K_SUMMARY',
        from: 'lead',
    },
] as const satisfies ReadonlyArray<{
    source: string;
    target: ZprSmartFieldCode;
    from: 'deal' | 'company' | 'lead';
}>;

/**
 * Определение поля по коду. Нужно потоку, чтобы знать НАСТРОЙКИ поля при
 * записи: формат значения crm-связи зависит от того, к скольким сущностям
 * поле привязано и множественное ли оно (см. buildCrmLinkValue).
 */
export const ZPR_FIELD_DEF_BY_CODE = Object.fromEntries(
    ZPR_SMART_FIELDS.map(field => [field.code, field]),
) as Record<ZprSmartFieldCode, ZprSmartFieldDef>;

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
