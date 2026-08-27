import { PbxSalesEventFieldCode } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';

/**
 * Const-описание смарт-процесса «Презентации» (pres).
 *
 * ЗЕРКАЛО сделок «ОП Презентации» (воронка sales_presentation): один элемент
 * смарта = ОДНА презентация, со стадиями той же формы, связями с основной
 * сделкой/лидом/компанией/контактом, «5К»- и «Хвост»-блоками и историей
 * комментариев. Каркас 1-в-1 с ЗПР (pbx-zpr-smart) — сознательно: следом за
 * ЗПР это второй смарт того же семейства, и различаться им нечем, кроме
 * предметной области.
 *
 * ВАЖНО: сделки «ОП Презентации» продолжают работать как раньше — смарт живёт
 * ПАРАЛЛЕЛЬНО (зеркало), ничего не отключает и не заменяет. Смысл зеркала —
 * подготовить переезд презентаций в смарты: элементы удобнее открывать прямо
 * из родительских сущностей (вкладка в карточке сделки/компании/лида), и
 * отчёт по презентациям строится по одной сущности, а не по воронке сделок.
 *
 * Тип НЕ 'presentation': это имя уже занято Excel-шаблоном смарта
 * (SmartNameEnum.PRESENTATION, install/sales/smart/presentation) — const-ветка
 * ParseSmartService матчит шаблоны по паре (type, group) и перехватила бы его.
 * Берём 'pres' — тот же префикс, которым презентации живут в реестре полей
 * (appType: 'pres').
 */

/** Типы полей повторяют PortalFieldType (mapFieldTypeToBitrixType). */
export type PresentationFieldType =
    | 'string'
    | 'integer'
    | 'date'
    | 'datetime'
    | 'boolean'
    | 'enumeration'
    | 'employee'
    | 'crm';

export interface PresentationSmartEnumItem {
    /** Код значения (xmlId в Bitrix). */
    CODE: string;
    VALUE: string;
    SORT: number;
}

export interface PresentationSmartFieldDef {
    /** Код поля: суффикс UF-имени (UF_CRM_{typeId}_{code}) и xmlId. UPPER_SNAKE. */
    code: string;
    name: string;
    type: PresentationFieldType;
    items?: readonly PresentationSmartEnumItem[];
    isMultiple?: boolean;
    /** Для type='crm' — привязка к сущностям (без неё значения молча теряются). */
    crmEntities?: readonly ('LEAD' | 'DEAL' | 'CONTACT' | 'COMPANY')[];
}

export const PRESENTATION_SMART_TYPE = 'pres';
export const PRESENTATION_SMART_GROUP = 'sales';
/** Ключ идемпотентности установки — менять только с переустановкой везде. */
export const PRESENTATION_SMART_CODE = `${PRESENTATION_SMART_TYPE}_${PRESENTATION_SMART_GROUP}`;
export const PRESENTATION_SMART_TITLE = 'Презентации';

// ---------------------------------------------------------------------------
// Стадии: форма воронки sales_presentation (spres_*), коды по конвенции pbx
// ---------------------------------------------------------------------------

/**
 * Стадии зеркалят воронку сделок «ОП Презентации»
 * (PbxDealSalesPresentationCategoryType): заявка → план → перенос → исходы.
 *
 * «Перенос» (pending) — ОТКРЫТАЯ стадия намеренно: перенесённая презентация
 * остаётся живой и закрывается следующим отчётом, ровно как pres-сделка.
 * Семантика S/F задаётся ЯВНО: эвристика установщика по суффиксу не знает
 * ни NORESULT, ни того, что NEW/PLAN/PENDING — промежуточные.
 */
export const PRESENTATION_SMART_STAGES = [
    {
        code: 'pres_new',
        name: 'Заявка на презентацию',
        semantics: null,
        sort: 10,
    },
    { code: 'pres_plan', name: 'Запланирована', semantics: null, sort: 20 },
    {
        code: 'pres_pending',
        name: 'Презентация: Перенос',
        semantics: null,
        sort: 30,
    },
    {
        code: 'pres_success',
        name: 'Презентация проведена',
        semantics: 'S',
        sort: 40,
    },
    {
        code: 'pres_noresult',
        name: 'Презентация не состоялась',
        semantics: 'F',
        sort: 50,
    },
    {
        code: 'pres_fail',
        name: 'Отказ после презентации',
        semantics: 'F',
        sort: 60,
    },
] as const;

export type PresentationSmartStageCode =
    (typeof PRESENTATION_SMART_STAGES)[number]['code'];

// ---------------------------------------------------------------------------
// Результат презентации — то, что спрашивает отчёт по презентациям
// ---------------------------------------------------------------------------

/**
 * Единый справочник исхода. Стадия и так несёт исход, но фильтровать и
 * группировать отчёт по enum-полю дешевле, чем по stageId с его
 * DT{entityTypeId}_{catId}: префиксом.
 */
export const PRESENTATION_RESULT_ITEMS: readonly PresentationSmartEnumItem[] = [
    { CODE: 'pres_res_done', VALUE: 'Состоялась', SORT: 10 },
    { CODE: 'pres_res_noresult', VALUE: 'Не состоялась', SORT: 20 },
    { CODE: 'pres_res_moved', VALUE: 'Перенесена', SORT: 30 },
    { CODE: 'pres_res_fail', VALUE: 'Отказ после презентации', SORT: 40 },
] as const;

/** Код исхода — чтобы flow не писал сырые строки в enum-поле. */
export const PRESENTATION_RESULT_CODE = {
    done: 'pres_res_done',
    noresult: 'pres_res_noresult',
    moved: 'pres_res_moved',
    fail: 'pres_res_fail',
} as const;

export type PresentationResultCode =
    (typeof PRESENTATION_RESULT_CODE)[keyof typeof PRESENTATION_RESULT_CODE];

// ---------------------------------------------------------------------------
// Поля элемента
// ---------------------------------------------------------------------------

/**
 * Поля объявлены `as const satisfies` (а не аннотацией типа): так коды
 * остаются литералами и из них выводится {@link PresentationSmartFieldCode} —
 * запись в несуществующее поле не компилируется.
 */
export const PRESENTATION_SMART_FIELDS = [
    // === Связи (обязательный контур: без них элемент не найти из карточек) ===
    {
        code: 'PRES_BASE_DEAL',
        name: 'Основная сделка',
        type: 'crm',
        crmEntities: ['DEAL'],
    },
    {
        // Пока презентации живут сделками — ссылка на «свою» pres-сделку.
        // После переезда поле останется историей соответствия.
        code: 'PRES_DEAL',
        name: 'Сделка презентации (зеркало)',
        type: 'crm',
        crmEntities: ['DEAL'],
    },
    {
        code: 'PRES_LEAD',
        name: 'Лид/заявка',
        type: 'crm',
        crmEntities: ['LEAD'],
    },
    {
        code: 'PRES_COMPANY',
        name: 'Компания',
        type: 'crm',
        crmEntities: ['COMPANY'],
    },
    {
        code: 'PRES_CONTACT',
        name: 'Контакт презентации',
        type: 'crm',
        crmEntities: ['CONTACT'],
    },
    // «Полностью наш»: хоть одна ЗАЯВКА (лидоген) среди привязок.
    {
        code: 'PRES_IS_OUR_REQUEST',
        name: 'Из заявки (полностью наш)',
        type: 'boolean',
    },

    // === Планирование / исполнение ===
    { code: 'PRES_PLAN_DATE', name: 'Запланирована на', type: 'datetime' },
    { code: 'PRES_DONE_DATE', name: 'Проведена', type: 'datetime' },
    {
        code: 'PRES_IS_SPONTANEOUS',
        name: 'Спонтанная (незапланированная)',
        type: 'boolean',
    },
    // Два ответственных — так же, как на сделке/компании живут
    // last_pres_done_responsible и last_pres_plan_responsible: отчёт считает
    // «назначил» и «провёл» разными людьми (лидоген vs менеджер).
    { code: 'PRES_RESPONSIBLE', name: 'Провёл презентацию', type: 'employee' },
    {
        code: 'PRES_PLAN_RESPONSIBLE',
        name: 'Назначил презентацию',
        type: 'employee',
    },
    {
        code: 'PRES_RESULT',
        name: 'Результат',
        type: 'enumeration',
        items: PRESENTATION_RESULT_ITEMS,
    },
    {
        // Считаем переносы: «сколько раз клиент отодвигал презентацию» —
        // отдельный вопрос отчёта, по стадии его не восстановить.
        code: 'PRES_MOVE_COUNT',
        name: 'Переносов',
        type: 'integer',
    },

    // === «5К»: сводка + девять детальных ответов анкеты ===
    { code: 'PRES_5K_SUMMARY', name: 'Пять К (сводно)', type: 'string' },
    { code: 'PRES_5K_CLIENT_WHAT', name: 'КЛИЕНТ: Что хочет?', type: 'string' },
    {
        code: 'PRES_5K_CLIENT_READY',
        name: 'КЛИЕНТ: Готов работать?',
        type: 'string',
    },
    {
        code: 'PRES_5K_CLIENT_PRICE',
        name: 'КЛИЕНТ: Укладываемся в цену?',
        type: 'string',
    },
    {
        code: 'PRES_5K_COMPANY_WHO',
        name: 'КОМПАНИЯ: Кто принимает решение?',
        type: 'string',
    },
    {
        code: 'PRES_5K_COMPANY_HOW',
        name: 'КОМПАНИЯ: Как принимается решение?',
        type: 'string',
    },
    {
        code: 'PRES_5K_COMPANY_RIGHT',
        name: 'КОМПАНИЯ: Правильно ли подобрали цену и комплект?',
        type: 'string',
    },
    {
        code: 'PRES_5K_COMMAND',
        name: 'КОЛЛЕГИ: Кто будет работать с системой, будут ли обсуждать?',
        type: 'string',
    },
    {
        code: 'PRES_5K_CONCURENT',
        name: 'КОНКУРЕНТ: По каким критериям нас сравнивают?',
        type: 'string',
    },
    {
        code: 'PRES_5K_CRITERI',
        name: 'КРИТЕРИЙ ВЫБОРА: Что важно при выборе СПС?',
        type: 'string',
    },

    // === «Разговор»: шесть обязательных вопросов опросника ===
    // До появления полей op_talk_* эти ответы жили только в тексте
    // комментария: у элемента презентации не было своего снимка разговора.
    {
        code: 'PRES_TALK_IMPRESSION',
        name: 'РАЗГОВОР: Первое впечатление',
        type: 'string',
    },
    {
        code: 'PRES_TALK_REMEMBERED',
        name: 'РАЗГОВОР: Что запомнили',
        type: 'string',
    },
    {
        code: 'PRES_TALK_DESIRE',
        name: 'РАЗГОВОР: Желание работать',
        type: 'string',
    },
    {
        code: 'PRES_TALK_DECISION_PROCESS',
        name: 'РАЗГОВОР: Как принимается решение',
        type: 'string',
    },
    {
        code: 'PRES_TALK_PRICE_OPINION',
        name: 'РАЗГОВОР: Мнение о цене',
        type: 'string',
    },
    {
        code: 'PRES_TALK_BOSS_READINESS',
        name: 'РАЗГОВОР: Готовность подойти к руководителю',
        type: 'string',
    },

    // === «Хвост»: сводка + вопросы «Разговора», выдернутые в фича-поля ===
    { code: 'PRES_XVOST', name: 'Хвост (сводно)', type: 'string' },
    {
        code: 'PRES_DECISION_CALL_DATE',
        name: 'Дата звонка по решению',
        type: 'date',
    },
    {
        code: 'PRES_DECISION_AGREEMENT',
        name: 'Согласование даты по решению',
        type: 'date',
    },
    {
        code: 'PRES_MANAGER_APPROACH_DATE',
        name: 'Дата похода к руководителю',
        type: 'date',
    },
    { code: 'PRES_IS_OFFER', name: 'Предложено КП ?', type: 'boolean' },
    {
        code: 'PRES_IS_COMPLECT',
        name: 'Озвучено наполнение ?',
        type: 'boolean',
    },
    { code: 'PRES_IS_PRICE', name: 'Озвучена цена ?', type: 'boolean' },

    // === История комментариев (план / отчёт / накопительная лента) ===
    {
        code: 'PRES_PLAN_COMMENT',
        name: 'Комментарий планирования',
        type: 'string',
    },
    { code: 'PRES_REPORT_COMMENT', name: 'Комментарий отчёта', type: 'string' },
    {
        code: 'PRES_COMMENTS',
        name: 'История комментариев',
        type: 'string',
        isMultiple: true,
    },

    // === Зеркала истории/дат из основной сделки (op_mhistory-контур) ===
    {
        code: 'PRES_MHISTORY',
        name: 'История (зеркало сделки)',
        type: 'string',
        isMultiple: true,
    },
    {
        code: 'PRES_LAST_CALL_DATE',
        name: 'Дата последнего касания',
        type: 'datetime',
    },
    {
        code: 'PRES_NEXT_CALL_DATE',
        name: 'Дата следующего касания',
        type: 'datetime',
    },
] as const satisfies readonly PresentationSmartFieldDef[];

/** Код поля смарта — все записи flow типизированы этим union. */
export type PresentationSmartFieldCode =
    (typeof PRESENTATION_SMART_FIELDS)[number]['code'];

// ---------------------------------------------------------------------------
// Зеркало анкеты: поле реестра pbx → поле смарта
// ---------------------------------------------------------------------------

/**
 * Откуда flow берёт снимок анкеты для элемента.
 *
 * `lead` — анкету «5К»/«Хвост» заполняет фрейм В КАРТОЧКЕ КЛИЕНТА, и девять
 * детальных ответов установлены ТОЛЬКО на лиде (см. комментарий к
 * op_5k_* в реестре полей). `deal` — вопросы «Разговора» (op_xvost_*),
 * которые фрейм пишет в БАЗОВУЮ сделку, на лиде их нет вовсе.
 */
export type PresentationSurveySource = 'lead' | 'deal';

export interface PresentationSurveyMirrorEntry {
    /** Код поля в реестре pbx (PBX_SALES_EVENT_FIELDS). */
    source: PbxSalesEventFieldCode;
    /** Куда лечь в элементе смарта. */
    target: PresentationSmartFieldCode;
    /** С какой сущности читать значение. */
    from: PresentationSurveySource;
}

/**
 * Карта переноса анкеты в элемент смарта — тот же набор, что копирует
 * event-report в pres-сделку (PRESENTATION_SURVEY_FIELD_CODES +
 * XVOST_DEAL_FIELD_CODES). Смарт получает СВОЙ снимок на каждую
 * презентацию: следующая презентация перезатрёт значения на лиде и сделке,
 * а история по каждой останется в своём элементе.
 *
 * Состав: 2 сводных («5К»/«Хвост») + 9 детальных «5К» + 6 вопросов
 * «Разговора» (op_talk_*, с лида) + 6 полей «Хвоста» (op_xvost_*, только
 * со сделки) = 23 записи; длину фиксирует спека.
 */
export const PRESENTATION_SMART_SURVEY_MIRROR: readonly PresentationSurveyMirrorEntry[] =
    [
        {
            source: 'op_presentation_5k',
            target: 'PRES_5K_SUMMARY',
            from: 'lead',
        },
        { source: 'op_presentation_xvost', target: 'PRES_XVOST', from: 'lead' },
        {
            source: 'op_5k_client_what',
            target: 'PRES_5K_CLIENT_WHAT',
            from: 'lead',
        },
        {
            source: 'op_5k_client_ready',
            target: 'PRES_5K_CLIENT_READY',
            from: 'lead',
        },
        {
            source: 'op_5k_client_price',
            target: 'PRES_5K_CLIENT_PRICE',
            from: 'lead',
        },
        {
            source: 'op_5k_company_who',
            target: 'PRES_5K_COMPANY_WHO',
            from: 'lead',
        },
        {
            source: 'op_5k_company_how',
            target: 'PRES_5K_COMPANY_HOW',
            from: 'lead',
        },
        {
            source: 'op_5k_company_right',
            target: 'PRES_5K_COMPANY_RIGHT',
            from: 'lead',
        },
        { source: 'op_5k_command', target: 'PRES_5K_COMMAND', from: 'lead' },
        {
            source: 'op_5k_concurent',
            target: 'PRES_5K_CONCURENT',
            from: 'lead',
        },
        { source: 'op_5k_criteri', target: 'PRES_5K_CRITERI', from: 'lead' },
        // Шесть обязательных вопросов «Разговора»: анкету пишет фрейм в ЛИД
        // (как и «5К»), элемент получает СВОЙ снимок на каждую презентацию.
        {
            source: 'op_talk_impression',
            target: 'PRES_TALK_IMPRESSION',
            from: 'lead',
        },
        {
            source: 'op_talk_remembered',
            target: 'PRES_TALK_REMEMBERED',
            from: 'lead',
        },
        {
            source: 'op_talk_desire',
            target: 'PRES_TALK_DESIRE',
            from: 'lead',
        },
        {
            source: 'op_talk_decision_process',
            target: 'PRES_TALK_DECISION_PROCESS',
            from: 'lead',
        },
        {
            source: 'op_talk_price_opinion',
            target: 'PRES_TALK_PRICE_OPINION',
            from: 'lead',
        },
        {
            source: 'op_talk_boss_readiness',
            target: 'PRES_TALK_BOSS_READINESS',
            from: 'lead',
        },
        // Булевы вопросы и даты «Хвоста» — только сделка (на лиде их нет).
        {
            source: 'op_xvost_decision_call_date',
            target: 'PRES_DECISION_CALL_DATE',
            from: 'deal',
        },
        {
            source: 'op_xvost_decision_date_agreement',
            target: 'PRES_DECISION_AGREEMENT',
            from: 'deal',
        },
        {
            source: 'op_manager_approach_date',
            target: 'PRES_MANAGER_APPROACH_DATE',
            from: 'deal',
        },
        { source: 'op_xvost_is_offer', target: 'PRES_IS_OFFER', from: 'deal' },
        {
            source: 'op_xvost_is_complect',
            target: 'PRES_IS_COMPLECT',
            from: 'deal',
        },
        { source: 'op_xvost_is_price', target: 'PRES_IS_PRICE', from: 'deal' },
    ] as const;

// ---------------------------------------------------------------------------
// Имена полей (канон СКАП: buildSkapUfName / buildSkapItemFieldName)
// ---------------------------------------------------------------------------

/**
 * UF-имя поля для userfieldconfig.*: UF_CRM_{typeId}_{code}.
 * typeId — id смарт-типа из crm.type.list (НЕ entityTypeId!).
 */
export function buildPresentationUfName(
    typeId: number | string,
    code: string,
): string {
    return `UF_CRM_${typeId}_${code}`;
}

/**
 * ФОРМУЛЬНОЕ имя поля в crm.item.* API: camelCase от UF-имени
 * (UF_CRM_8_PRES_BASE_DEAL → ufCrm8PresBaseDeal). Фактический ключ может
 * отличаться (боевой инцидент UF_CRM_94_TRANSCRIPT_1) — установщик сверяет
 * формулу с crm.item.fields и пишет в зеркало фактическое значение.
 */
export function buildPresentationItemFieldName(
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
 * Суффикс STATUS_ID стадии по коду шаблона: 'pres_plan' → 'PLAN'.
 * Полный STATUS_ID собирает стратегия смартов:
 * DT{entityTypeId}_{bxCategoryId}:{суффикс}.
 */
export function presentationStageBitrixId(stageCode: string): string {
    return stageCode.replace(/^pres_/, '').toUpperCase();
}
