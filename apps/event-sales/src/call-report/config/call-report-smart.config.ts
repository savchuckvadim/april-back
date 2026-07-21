/**
 * Const-описание смарт-процесса «AI-анализ звонков» (v2).
 *
 * Единственный источник правды о смарте: установка полей (installer),
 * запись элементов (writer), DTO агента и маппинг результатов используют
 * ЭТОТ файл. Состав полей ожидаемо будет меняться — добавьте поле сюда
 * и повторно вызовите POST /call-report/install-smart для портала:
 * установка идемпотентна, добавятся только отсутствующие поля.
 *
 * Никаких дополнительных сущностей не плодим: весь анализ — в полях
 * одного смарта; связи — parent-сделка, companyId, crm-поля на сделки
 * воронок (ОП / ХО / Презентации) и id элементов списков KPI/История.
 */

/** Типы полей повторяют PortalFieldType (mapFieldTypeToBitrixType). */
export type CallReportFieldType =
    | 'string'
    | 'integer'
    | 'datetime'
    | 'boolean'
    | 'enumeration'
    | 'employee'
    | 'crm';

export interface CallReportSmartEnumItem {
    /** Код значения (xmlId в Bitrix). */
    CODE: string;
    /** Отображаемое значение. */
    VALUE: string;
    SORT: number;
}

export interface CallReportSmartFieldDef {
    /** Код поля: суффикс UF-имени (UF_CRM_{etid}_{code}) и xmlId. UPPER_SNAKE. */
    code: string;
    /** Русское название поля в карточке/списке. */
    name: string;
    type: CallReportFieldType;
    /** Значения для enumeration-полей. */
    items?: readonly CallReportSmartEnumItem[];
}

export const CALL_REPORT_SMART_TYPE = 'aicall';
export const CALL_REPORT_SMART_GROUP = 'report';
/** Код смарта в Bitrix — по конвенции pbx-install: `${type}_${group}`. */
export const CALL_REPORT_SMART_CODE = `${CALL_REPORT_SMART_TYPE}_${CALL_REPORT_SMART_GROUP}`;
export const CALL_REPORT_SMART_TITLE = 'AI-анализ звонков';

// ---------------------------------------------------------------------------
// Типы звонков
// ---------------------------------------------------------------------------

/**
 * Коды типов звонков — единый источник правды: enum-поле смарта и
 * AGENT_CALL_TYPES в agent-gate выводятся отсюда (compile-time связка).
 */
export const CALL_REPORT_CALL_TYPE_CODES = [
    'cold',
    'call',
    'presentation',
    'decision',
    'payment',
    'other',
] as const;

export type CallReportCallTypeCode =
    (typeof CALL_REPORT_CALL_TYPE_CODES)[number];

export const CALL_REPORT_CALL_TYPE_ITEMS = [
    { CODE: 'cold', VALUE: 'Холодный (выход на ЛПР)', SORT: 100 },
    { CODE: 'call', VALUE: 'Звонок (цель — презентация)', SORT: 200 },
    { CODE: 'presentation', VALUE: 'Презентация', SORT: 300 },
    { CODE: 'decision', VALUE: 'Звонок по решению', SORT: 400 },
    { CODE: 'payment', VALUE: 'Звонок по оплате', SORT: 500 },
    { CODE: 'other', VALUE: 'Другое', SORT: 600 },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportCallTypeCode;
})[];

// ---------------------------------------------------------------------------
// Разделы анализа разговора
// ---------------------------------------------------------------------------

/**
 * Формализованные разделы (этапы) анализа. По каждому агент возвращает:
 * коэффициент актуальности (0–100: насколько раздел вообще применим к
 * ЭТОМУ типу звонка; 0 — не оцениваем), оценку 1–10 (только при
 * актуальности > 0), разбор и рекомендации (как надо было ответить /
 * альтернативы / что потренировать).
 */
export const CALL_REPORT_SECTIONS = [
    { code: 'GREETING', title: 'Приветствие' },
    { code: 'NEEDS', title: 'Выявление потребностей' },
    { code: 'PRESENTATION', title: 'Презентация под потребности' },
    { code: 'OBJECTIONS', title: 'Работа с возражениями' },
    { code: 'PRICE', title: 'Работа по цене' },
    { code: 'CLOSING', title: 'Закрытие разговора' },
    { code: 'REFUSAL', title: 'Поведение при отказах' },
] as const;

export type CallReportSectionCode =
    (typeof CALL_REPORT_SECTIONS)[number]['code'];

export const CALL_REPORT_SECTION_CODES = CALL_REPORT_SECTIONS.map(
    section => section.code,
) as readonly CallReportSectionCode[];

/** Поля одного раздела анализа: суффиксы к коду раздела. */
const SECTION_FIELD_SUFFIXES = [
    {
        suffix: 'RELEVANCE',
        name: 'коэф. актуальности (0-100)',
        type: 'integer',
    },
    { suffix: 'SCORE', name: 'оценка (1-10)', type: 'integer' },
    { suffix: 'ANALYSIS', name: 'разбор', type: 'string' },
    { suffix: 'ADVICE', name: 'рекомендации', type: 'string' },
] as const;

function buildSectionFields(): CallReportSmartFieldDef[] {
    const fields: CallReportSmartFieldDef[] = [];
    for (const section of CALL_REPORT_SECTIONS) {
        for (const def of SECTION_FIELD_SUFFIXES) {
            fields.push({
                code: `${section.code}_${def.suffix}`,
                name: `${section.title}: ${def.name}`,
                type: def.type,
            });
        }
    }
    return fields;
}

// ---------------------------------------------------------------------------
// Транскрипт кусками
// ---------------------------------------------------------------------------

/** Максимум символов в одном UF-поле транскрипта (запас к лимитам Bitrix). */
export const CALL_REPORT_TRANSCRIPT_CHUNK_SIZE = 40_000;
/** Число полей под транскрипт: 4 × 40k ≈ 3 часа разговора. */
export const CALL_REPORT_TRANSCRIPT_PARTS = 4;

function buildTranscriptFields(): CallReportSmartFieldDef[] {
    return Array.from({ length: CALL_REPORT_TRANSCRIPT_PARTS }, (_, index) => ({
        code: `TRANSCRIPT_${index + 1}`,
        name: `Транскрипт, часть ${index + 1}`,
        type: 'string' as const,
    }));
}

// ---------------------------------------------------------------------------
// Статус привязки элементов списков
// ---------------------------------------------------------------------------

/** Уверенность привязки к записи отчётности: подтверждено / подозрение. */
export const CALL_REPORT_LINK_STATUS_CODES = [
    'confirmed',
    'suspected',
] as const;

export type CallReportLinkStatusCode =
    (typeof CALL_REPORT_LINK_STATUS_CODES)[number];

export const CALL_REPORT_LINK_STATUS_ITEMS = [
    { CODE: 'confirmed', VALUE: 'Подтверждено', SORT: 100 },
    { CODE: 'suspected', VALUE: 'Подозрение', SORT: 200 },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportLinkStatusCode;
})[];

// ---------------------------------------------------------------------------
// Полный список полей смарта
// ---------------------------------------------------------------------------

export const CALL_REPORT_SMART_FIELDS: CallReportSmartFieldDef[] = [
    // — Идентификация звонка —
    { code: 'ACTIVITY_ID', name: 'ID активности звонка', type: 'string' },
    { code: 'CALL_ID', name: 'ID звонка (телефония)', type: 'string' },
    { code: 'CALL_DATE', name: 'Дата и время звонка', type: 'datetime' },
    { code: 'DURATION_SEC', name: 'Длительность, сек', type: 'integer' },
    { code: 'MANAGER', name: 'Менеджер (ответственный)', type: 'employee' },
    { code: 'TRANSCRIPTION_ID', name: 'ID транскрипции (БД)', type: 'string' },

    // — Классификация —
    {
        code: 'CALL_TYPE',
        name: 'Тип звонка',
        type: 'enumeration',
        items: CALL_REPORT_CALL_TYPE_ITEMS,
    },
    { code: 'PRODUCTIVE', name: 'Звонок результативный', type: 'boolean' },

    // — Связи с воронками и отчётностью (если удалось установить) —
    { code: 'DEAL_MAIN', name: 'ОП: основная сделка', type: 'crm' },
    { code: 'DEAL_PRESENTATION', name: 'Сделка ОП Презентации', type: 'crm' },
    { code: 'DEAL_XO', name: 'Сделка ХО', type: 'crm' },
    { code: 'KPI_ITEM_ID', name: 'Элемент списка ОП KPI', type: 'string' },
    {
        code: 'KPI_ITEM_STATUS',
        name: 'Привязка к ОП KPI',
        type: 'enumeration',
        items: CALL_REPORT_LINK_STATUS_ITEMS,
    },
    {
        code: 'HISTORY_ITEM_ID',
        name: 'Элемент списка ОП История',
        type: 'string',
    },
    {
        code: 'HISTORY_ITEM_STATUS',
        name: 'Привязка к ОП Истории',
        type: 'enumeration',
        items: CALL_REPORT_LINK_STATUS_ITEMS,
    },
    {
        code: 'RELATED_REPORTS',
        name: 'Прочие связанные записи отчётов',
        type: 'string',
    },

    // — Содержание разговора —
    { code: 'SUMMARY', name: 'Резюме звонка', type: 'string' },
    { code: 'NEEDS_FOUND', name: 'Потребности выявлены', type: 'boolean' },
    { code: 'NEEDS', name: 'Выявленные потребности', type: 'string' },
    {
        code: 'PRESENTATION_DONE',
        name: 'Презентация проведена',
        type: 'boolean',
    },
    { code: 'PRODUCTS_OFFERED', name: 'Предложенные продукты', type: 'string' },
    { code: 'OBJECTIONS', name: 'Возражения клиента', type: 'string' },
    {
        code: 'OBJECTIONS_HANDLING',
        name: 'Отработка возражений (с разбором причин)',
        type: 'string',
    },

    // — Первичный RAG-анализ (контур 1) —
    { code: 'RESUME_GIGACHAT', name: 'Резюме GigaChat (RAG)', type: 'string' },
    {
        code: 'RECOMENDATION_GIGACHAT',
        name: 'Рекомендации GigaChat (RAG)',
        type: 'string',
    },

    // — Итоговая оценка агента —
    { code: 'SCORE', name: 'Оценка звонка (1-10)', type: 'integer' },
    { code: 'SCORE_EXPLANATION', name: 'Объяснение оценки', type: 'string' },
    {
        code: 'SPEECH_ANALYSIS',
        name: 'Анализ речи менеджера (спич, свойство-связка-выгода)',
        type: 'string',
    },
    {
        code: 'EMPLOYEE_RECOMMENDATIONS',
        name: 'Рекомендации сотруднику (что тренировать)',
        type: 'string',
    },
    { code: 'RECOMMENDATIONS', name: 'Рекомендации по сделке', type: 'string' },

    // — Разделы анализа (7 × актуальность/оценка/разбор/рекомендации) —
    ...buildSectionFields(),

    // — Транскрипт кусками —
    ...buildTranscriptFields(),

    // — Служебные —
    { code: 'AGENT_NAME', name: 'Имя агента-аналитика', type: 'string' },
    { code: 'AGENT_VERSION', name: 'Версия скилла агента', type: 'string' },
];

/** UF-имя поля для userfieldconfig: UF_CRM_{entityTypeId}_{code}. */
export function buildCallReportUfName(
    entityTypeId: number | string,
    code: string,
): string {
    return `UF_CRM_${entityTypeId}_${code}`;
}

/**
 * Имя поля в crm.item.* API: camelCase от UF-имени
 * (UF_CRM_13_PERIOD_FROM → ufCrm13PeriodFrom — см. smart-act.service).
 */
export function buildCallReportItemFieldName(
    entityTypeId: number | string,
    code: string,
): string {
    const pascal = code
        .toLowerCase()
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    return `ufCrm${entityTypeId}${pascal}`;
}

/** Режет транскрипт на куски под поля TRANSCRIPT_1..N (хвост отбрасывается с пометкой). */
export function splitTranscriptForSmart(transcript: string): string[] {
    const parts: string[] = [];
    for (let i = 0; i < CALL_REPORT_TRANSCRIPT_PARTS; i++) {
        const start = i * CALL_REPORT_TRANSCRIPT_CHUNK_SIZE;
        if (start >= transcript.length) break;
        parts.push(
            transcript.slice(start, start + CALL_REPORT_TRANSCRIPT_CHUNK_SIZE),
        );
    }
    const maxLen =
        CALL_REPORT_TRANSCRIPT_PARTS * CALL_REPORT_TRANSCRIPT_CHUNK_SIZE;
    if (transcript.length > maxLen && parts.length) {
        parts[parts.length - 1] += '\n…[транскрипт обрезан, полный — в БД]';
    }
    return parts;
}
