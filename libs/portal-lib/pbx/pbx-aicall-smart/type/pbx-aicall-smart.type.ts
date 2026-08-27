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
    /** Множественное поле (multi-enum справочники). */
    isMultiple?: boolean;
    /**
     * Для type='crm' — к каким сущностям привязано поле (settings в
     * userfieldconfig). БЕЗ этого Bitrix создаёт crm-поле без привязок и
     * значения вида ['D_123'] молча не сохраняются (боевой инцидент
     * 2026-07-22: связи DEAL_* оставались пустыми).
     */
    crmEntities?: readonly ('LEAD' | 'DEAL' | 'CONTACT' | 'COMPANY')[];
}

export const CALL_REPORT_SMART_TYPE = 'aicall';
/** Смарт относится к продажам — group=sales (решение 2026-07-22). */
export const CALL_REPORT_SMART_GROUP = 'sales';
/**
 * Код смарта в Bitrix — по конвенции pbx-install `${type}_${group}`.
 * ВАЖНО: code — ключ идемпотентности установки; менять его можно только
 * с полной переустановкой смарта на всех порталах (удаление типа в Bitrix
 * и строк в PortalDB), иначе установка создаст дубликат типа.
 */
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
    // Первый звонок по входящей заявке с сайта (прайс/демо/документ/
    // семинар/Искра) — тёплый вход, свой регламент (легализация →
    // диагностика → фильтр ЦА → предложение зайти в систему).
    'site_lead',
    'call',
    'presentation',
    // Доработка после презентации: решение не созрело, работаем с
    // возражениями (стадия sales_refine и событие КПИ refine).
    'refine',
    'decision',
    'payment',
    'other',
    // Гейт нерелевантности: разговор вообще не про работу менеджера
    // (звонок в стороннюю организацию, личный, ошибочный) — конвейер
    // останавливается после дешёвой классификации, дорогие шаги не идут.
    'irrelevant',
] as const;

export type CallReportCallTypeCode =
    (typeof CALL_REPORT_CALL_TYPE_CODES)[number];

export const CALL_REPORT_CALL_TYPE_ITEMS = [
    { CODE: 'cold', VALUE: 'Холодный (выход на ЛПР)', SORT: 100 },
    { CODE: 'site_lead', VALUE: 'Заявка с сайта', SORT: 150 },
    { CODE: 'call', VALUE: 'Звонок (цель — презентация)', SORT: 200 },
    { CODE: 'presentation', VALUE: 'Презентация', SORT: 300 },
    { CODE: 'refine', VALUE: 'Доработка (после презентации)', SORT: 350 },
    { CODE: 'decision', VALUE: 'Звонок по решению', SORT: 400 },
    { CODE: 'payment', VALUE: 'Звонок по оплате', SORT: 500 },
    { CODE: 'other', VALUE: 'Другое', SORT: 600 },
    { CODE: 'irrelevant', VALUE: 'Нерелевантный (не наш разговор)', SORT: 700 },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportCallTypeCode;
})[];

// ---------------------------------------------------------------------------
// Профили типов звонков: тип ↔ анализ
// ---------------------------------------------------------------------------

/**
 * Профиль типа звонка — управляющий параметр речевого анализа:
 * приоры релевантности разделов, речевые нормы, kind базы знаний с
 * инструкцией анализа ИМЕННО этого типа.
 *
 * Приоры — ориентир, не приговор: агент может отклоняться от них,
 * но обязан объяснить отклонение в analysis раздела.
 *
 * Подмена без деплоя: сами ИНСТРУКЦИИ анализа лежат в базе знаний
 * (kind из knowledgeKind, редактируются через /agent/knowledge и
 * /ai-rag/knowledge); числовые приоры меняются здесь (единый источник
 * правды, как и остальной конфиг смарта).
 */
export interface CallReportTypeProfile {
    /** Что главное в звонке этого типа (короткая шпаргалка аналитику). */
    focus: string;
    /** Приоры релевантности разделов 0-100 (REFUSAL — по факту отказа). */
    sectionRelevance: Record<CallReportSectionCode, number>;
    /** Норма доли речи менеджера, % (null — норма не задаётся). */
    talkRatioNorm: { min: number; max: number } | null;
    /** Норма числа вопросов менеджера (null — не нормируется). */
    questionsNorm: { min: number; max: number } | null;
    /** Kind базы знаний с инструкцией/скриптом анализа этого типа. */
    knowledgeKind: string;
}

export const CALL_REPORT_TYPE_PROFILES: Record<
    CallReportCallTypeCode,
    CallReportTypeProfile
> = {
    cold: {
        focus: 'Выход на ЛПР: проход секретаря, зацепка, договорённость о контакте с ЛПР.',
        sectionRelevance: {
            GREETING: 100,
            NEEDS: 60,
            PRESENTATION: 20,
            OBJECTIONS: 70,
            PRICE: 10,
            CLOSING: 80,
            REFUSAL: 60,
        },
        talkRatioNorm: { min: 30, max: 55 },
        questionsNorm: { min: 3, max: 8 },
        knowledgeKind: 'call-analysis-cold',
    },
    site_lead: {
        focus: 'Первый звонок по заявке с сайта: вход тёплый (клиент сам оставил контакты), но звонок исходящий и инициатива — у менеджера. Легализация звонка («вопросы для отчёта»), диагностика что искал, фильтр ЦА («по работе?»), предложение зайти в систему под задачу; минимум — цена и КП; закрытие на конкретную дату.',
        sectionRelevance: {
            GREETING: 90,
            NEEDS: 90,
            PRESENTATION: 40,
            OBJECTIONS: 60,
            PRICE: 50,
            CLOSING: 90,
            REFUSAL: 50,
        },
        talkRatioNorm: { min: 40, max: 60 },
        questionsNorm: { min: 5, max: 10 },
        knowledgeKind: 'call-analysis-site-lead',
    },
    call: {
        focus: 'Договориться о презентации: выявление потребностей, назначение конкретного слота.',
        sectionRelevance: {
            GREETING: 70,
            NEEDS: 100,
            PRESENTATION: 40,
            OBJECTIONS: 80,
            PRICE: 30,
            CLOSING: 90,
            REFUSAL: 50,
        },
        talkRatioNorm: { min: 40, max: 60 },
        questionsNorm: { min: 11, max: 14 },
        knowledgeKind: 'call-analysis-call',
    },
    presentation: {
        focus: 'Презентация под потребности: свойство-связка-выгода, вовлечение, следующий шаг. Презентация = предметный показ или рассказ продукта под задачи клиента (прямой мост к продаже); «поговорили» или «выслал демо» — не презентация.',
        sectionRelevance: {
            GREETING: 40,
            NEEDS: 70,
            PRESENTATION: 100,
            OBJECTIONS: 80,
            PRICE: 60,
            CLOSING: 90,
            REFUSAL: 40,
        },
        talkRatioNorm: { min: 50, max: 70 },
        questionsNorm: { min: 6, max: 12 },
        knowledgeKind: 'call-analysis-presentation',
    },
    /**
     * ДОРАБОТКА (refine) — звонок после презентации, когда решение НЕ
     * созрело: «подумаю», «ни да ни нет», формальное «нет», в котором
     * менеджер слышит «попозже». Именно возражение и есть причина, по
     * которой сделка осталась в доработке, а не ушла в звонок по решению
     * (поэтому справочник возражений так похож на справочник отказа —
     * возражение здесь работает как мини-отказ).
     *
     * Отличие от decision: там решение вызревает и обсуждается предметно,
     * здесь — снимается неопределённость и возвращается интерес.
     */
    refine: {
        focus: 'Снять неопределённость после презентации: вытащить настоящее возражение (за «подумаю» почти всегда стоит конкретная причина), вернуть ценность и договориться о звонке по решению с датой. Возражение здесь — не провал, а материал: его надо назвать вслух и отработать, иначе сделка зависает в доработке.',
        sectionRelevance: {
            GREETING: 40,
            NEEDS: 70,
            PRESENTATION: 40,
            OBJECTIONS: 100,
            PRICE: 60,
            CLOSING: 90,
            REFUSAL: 80,
        },
        talkRatioNorm: { min: 35, max: 55 },
        questionsNorm: { min: 5, max: 12 },
        knowledgeKind: 'call-analysis-refine',
    },
    /**
     * ЗВОНОК ПО РЕШЕНИЮ — не «дожим», а ПЕРЕСБОРКА ЦЕННОСТИ спустя время.
     * Продукт заново не показывают: напоминают о выявленных на презентации
     * потребностях и болях и о том, как продукт их закрывает, — чтобы,
     * снимая возражения, восстановить ценность. Поверх ценности продукта
     * идут отдельные продажи: цены (что входит в пакет за эти деньги),
     * предложения (три по цене двух, подарки, акция, год бесплатно) и
     * продажа через недостаток конкурента.
     */
    decision: {
        focus: 'Решение: воссоздать ценность продукта спустя время через напоминание о ЕГО задачах и болях (не повторный показ), снять возражения, продать цену и предложение (пакет/акция/подарок), при необходимости — отстроиться от конкурента. Итог — решение и сроки.',
        sectionRelevance: {
            GREETING: 30,
            // Презентации нет заново, но напоминание о ценности под
            // выявленные боли — обязательная часть звонка по решению.
            NEEDS: 70,
            PRESENTATION: 60,
            OBJECTIONS: 100,
            PRICE: 100,
            CLOSING: 100,
            REFUSAL: 70,
        },
        talkRatioNorm: { min: 40, max: 60 },
        questionsNorm: { min: 4, max: 10 },
        knowledgeKind: 'call-analysis-decision',
    },
    payment: {
        focus: 'Оплата: счёт/договор, сроки, снятие последних блокеров.',
        sectionRelevance: {
            GREETING: 20,
            NEEDS: 10,
            PRESENTATION: 10,
            OBJECTIONS: 60,
            PRICE: 90,
            CLOSING: 100,
            REFUSAL: 50,
        },
        talkRatioNorm: null,
        questionsNorm: null,
        knowledgeKind: 'call-analysis-payment',
    },
    other: {
        focus: 'Нетиповой звонок: оценивать только фактически применимые разделы.',
        sectionRelevance: {
            GREETING: 50,
            NEEDS: 50,
            PRESENTATION: 50,
            OBJECTIONS: 50,
            PRICE: 50,
            CLOSING: 50,
            REFUSAL: 50,
        },
        talkRatioNorm: null,
        questionsNorm: null,
        knowledgeKind: 'call-analysis-other',
    },
    // До этого профиля конвейер в норме не доходит: гейт останавливает
    // обработку после классификации (см. CallReportPipelineUseCase).
    // Профиль нужен на случай ручного разбора нерелевантного звонка.
    irrelevant: {
        focus: 'Разговор не относится к продажам/сопровождению продуктов компании — техника продаж не оценивается.',
        sectionRelevance: {
            GREETING: 0,
            NEEDS: 0,
            PRESENTATION: 0,
            OBJECTIONS: 0,
            PRICE: 0,
            CLOSING: 0,
            REFUSAL: 0,
        },
        talkRatioNorm: null,
        questionsNorm: null,
        knowledgeKind: 'call-analysis-other',
    },
};

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
// Справочники v3 (оперативная/стратегическая аналитика — только закрытые
// списки: тренды и дашборды не строятся по свободному тексту)
// ---------------------------------------------------------------------------

/** Роль собеседника в звонке. */
export const CALL_REPORT_INTERLOCUTOR_CODES = [
    'lpr',
    'user',
    'secretary',
    'other',
] as const;
export type CallReportInterlocutorCode =
    (typeof CALL_REPORT_INTERLOCUTOR_CODES)[number];
export const CALL_REPORT_INTERLOCUTOR_ITEMS = [
    { CODE: 'lpr', VALUE: 'ЛПР', SORT: 100 },
    { CODE: 'user', VALUE: 'Пользователь (не ЛПР)', SORT: 200 },
    { CODE: 'secretary', VALUE: 'Секретарь', SORT: 300 },
    { CODE: 'other', VALUE: 'Другое', SORT: 400 },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportInterlocutorCode;
})[];

/**
 * Специальность собеседника — под неё подбирается карта демонстрации
 * (свойство → связка → выгода): у бухгалтера, юриста и кадровика разные
 * задачи и разные «крючки» показа. Определяет глубокий разбор по лексике
 * разговора; должность из CRM приходит подсказкой в паспорте звонка.
 */
export const CALL_REPORT_SPECIALIST_CODES = [
    'accountant',
    'lawyer',
    'hr',
    'director',
    'other',
] as const;
export type CallReportSpecialistCode =
    (typeof CALL_REPORT_SPECIALIST_CODES)[number];
export const CALL_REPORT_SPECIALIST_ITEMS = [
    { CODE: 'accountant', VALUE: 'Бухгалтер', SORT: 100 },
    { CODE: 'lawyer', VALUE: 'Юрист', SORT: 200 },
    { CODE: 'hr', VALUE: 'Кадровик', SORT: 300 },
    { CODE: 'director', VALUE: 'Руководитель', SORT: 400 },
    { CODE: 'other', VALUE: 'Другой специалист', SORT: 500 },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportSpecialistCode;
})[];

/** Категории возражений (классическая пятёрка + скрытое). */
export const CALL_REPORT_OBJECTION_CODES = [
    'price',
    'timing',
    'need',
    'trust',
    'authority',
    'hidden',
] as const;
export type CallReportObjectionCode =
    (typeof CALL_REPORT_OBJECTION_CODES)[number];
export const CALL_REPORT_OBJECTION_ITEMS = [
    { CODE: 'price', VALUE: 'Цена', SORT: 100 },
    { CODE: 'timing', VALUE: 'Сроки / не сейчас', SORT: 200 },
    { CODE: 'need', VALUE: 'Нет потребности / всё есть', SORT: 300 },
    { CODE: 'trust', VALUE: 'Доверие / риск', SORT: 400 },
    { CODE: 'authority', VALUE: 'Полномочия / не моё решение', SORT: 500 },
    { CODE: 'hidden', VALUE: 'Скрытое возражение', SORT: 600 },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportObjectionCode;
})[];

/** Конкуренты (закрытый справочник для win-loss трендов). */
export const CALL_REPORT_COMPETITOR_CODES = [
    'consultant',
    'kodeks',
    'tehexpert',
    'glavbukh',
    'free_internet',
    'other',
] as const;
export type CallReportCompetitorCode =
    (typeof CALL_REPORT_COMPETITOR_CODES)[number];
export const CALL_REPORT_COMPETITOR_ITEMS = [
    { CODE: 'consultant', VALUE: 'КонсультантПлюс', SORT: 100 },
    { CODE: 'kodeks', VALUE: 'Кодекс', SORT: 200 },
    { CODE: 'tehexpert', VALUE: 'Техэксперт', SORT: 300 },
    { CODE: 'glavbukh', VALUE: 'Главбух / БСС', SORT: 400 },
    { CODE: 'free_internet', VALUE: 'Бесплатный интернет', SORT: 500 },
    { CODE: 'other', VALUE: 'Другой', SORT: 600 },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportCompetitorCode;
})[];

/** Риск-флаги (алерты РОПу). */
export const CALL_REPORT_RISK_FLAG_CODES = [
    'promise',
    'conflict',
    'compliance',
    'client_negative',
] as const;
export type CallReportRiskFlagCode =
    (typeof CALL_REPORT_RISK_FLAG_CODES)[number];
export const CALL_REPORT_RISK_FLAG_ITEMS = [
    { CODE: 'promise', VALUE: 'Необоснованное обещание клиенту', SORT: 100 },
    { CODE: 'conflict', VALUE: 'Конфликт / грубость', SORT: 200 },
    { CODE: 'compliance', VALUE: 'Нарушение регламента', SORT: 300 },
    { CODE: 'client_negative', VALUE: 'Сильный негатив клиента', SORT: 400 },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportRiskFlagCode;
})[];

/** Тон клиента. */
export const CALL_REPORT_SENTIMENT_CODES = [
    'positive',
    'neutral',
    'negative',
] as const;
export type CallReportSentimentCode =
    (typeof CALL_REPORT_SENTIMENT_CODES)[number];
export const CALL_REPORT_SENTIMENT_ITEMS = [
    { CODE: 'positive', VALUE: 'Позитивный', SORT: 100 },
    { CODE: 'neutral', VALUE: 'Нейтральный', SORT: 200 },
    { CODE: 'negative', VALUE: 'Негативный', SORT: 300 },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportSentimentCode;
})[];

/** Приоритет разбора звонка руководителем (coaching queue). */
export const CALL_REPORT_COACHING_CODES = [
    'urgent',
    'planned',
    'none',
] as const;
export type CallReportCoachingCode =
    (typeof CALL_REPORT_COACHING_CODES)[number];
export const CALL_REPORT_COACHING_ITEMS = [
    { CODE: 'urgent', VALUE: 'Срочно на разбор', SORT: 100 },
    { CODE: 'planned', VALUE: 'Плановый разбор', SORT: 200 },
    { CODE: 'none', VALUE: 'Разбор не требуется', SORT: 300 },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportCoachingCode;
})[];

/**
 * Категория отказа: рыночные причины vs исполнительские (deal-review
 * win/loss). Без этого win-loss аналитика вырождается в «всё из-за цены».
 */
export const CALL_REPORT_REFUSAL_CODES = [
    'price',
    'competitor',
    'no_decision',
    'qualification_issue',
    'execution_issue',
] as const;
export type CallReportRefusalCode = (typeof CALL_REPORT_REFUSAL_CODES)[number];
export const CALL_REPORT_REFUSAL_ITEMS = [
    { CODE: 'price', VALUE: 'Цена (рыночная)', SORT: 100 },
    { CODE: 'competitor', VALUE: 'Конкурент (рыночная)', SORT: 200 },
    { CODE: 'no_decision', VALUE: 'Решение не принято (рыночная)', SORT: 300 },
    {
        CODE: 'qualification_issue',
        VALUE: 'Слабая квалификация (исполнительская)',
        SORT: 400,
    },
    {
        CODE: 'execution_issue',
        VALUE: 'Слабое исполнение (исполнительская)',
        SORT: 500,
    },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportRefusalCode;
})[];

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

/** Серьёзность нарушений регламента (проверка по документам компании). */
export const CALL_REPORT_COMPLIANCE_SEVERITY_CODES = [
    'none',
    'low',
    'medium',
    'high',
] as const;
export type CallReportComplianceSeverityCode =
    (typeof CALL_REPORT_COMPLIANCE_SEVERITY_CODES)[number];

export const CALL_REPORT_COMPLIANCE_SEVERITY_ITEMS = [
    { CODE: 'none', VALUE: 'Нарушений нет', SORT: 100 },
    { CODE: 'low', VALUE: 'Мелкие замечания', SORT: 200 },
    { CODE: 'medium', VALUE: 'Нарушен порядок', SORT: 300 },
    { CODE: 'high', VALUE: 'Риск для компании', SORT: 400 },
] as const;

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
    // «Хвост» и «5К» (методология завершения презентации, 08.2026):
    // фильтры «презентации без закрытия» в списках смарта. Заполняются
    // разбором только для типов presentation/decision.
    {
        code: 'HVOST_DONE',
        name: 'Хвост пройден (после демо)',
        type: 'boolean',
    },
    {
        code: 'FIVE_K_DONE',
        name: '5К закрыто (контроль встречи)',
        type: 'boolean',
    },
    // Хвост/5К: краткие версии в полях (ужаты писателем до <700 байт —
    // row size), полные тексты — в таймлайне элемента. Пары «AI ↔ менеджер»
    // дают сравнение бок-о-бок прямо в карточке.
    {
        code: 'HVOST_ANALYSIS',
        name: 'Хвост: разбор AI (кратко)',
        type: 'string',
    },
    {
        code: 'FIVE_K_ANALYSIS',
        name: '5К: разбор AI (кратко)',
        type: 'string',
    },
    {
        code: 'HVOST_MANAGER',
        name: 'Хвост: отчёт менеджера (из сделки)',
        type: 'string',
    },
    {
        code: 'FIVE_K_MANAGER',
        name: '5К: отчёт менеджера (из сделки)',
        type: 'string',
    },
    // Гранулярный хвост/5К — зеркало чеклиста менеджера в сделке
    // (op_xvost_* / op_5k_* из pbx-sales-event-field): AI отвечает на ТЕ ЖЕ
    // вопросы по транскрипту, итоги HVOST_DONE/FIVE_K_DONE пересчитываются
    // кодом из этих пунктов. Заполняются только для presentation/decision.
    { code: 'HVOST_OFFER', name: 'Хвост AI: КП предложено', type: 'boolean' },
    {
        code: 'HVOST_COMPLECT',
        name: 'Хвост AI: наполнение озвучено',
        type: 'boolean',
    },
    { code: 'HVOST_PRICE', name: 'Хвост AI: цена озвучена', type: 'boolean' },
    {
        code: 'HVOST_DECISION_DATE',
        name: 'Хвост AI: дата решения назначена',
        type: 'boolean',
    },
    {
        code: 'HVOST_DATE_AGREED',
        name: 'Хвост AI: дата согласована с клиентом',
        type: 'boolean',
    },
    {
        code: 'FIVE_K_CLIENT_WHAT',
        name: '5К AI: клиент — что хочет',
        type: 'boolean',
    },
    {
        code: 'FIVE_K_CLIENT_READY',
        name: '5К AI: клиент — готов работать',
        type: 'boolean',
    },
    {
        code: 'FIVE_K_CLIENT_PRICE',
        name: '5К AI: клиент — укладываемся в цену',
        type: 'boolean',
    },
    {
        code: 'FIVE_K_COMPANY_WHO',
        name: '5К AI: компания — кто принимает решение',
        type: 'boolean',
    },
    {
        code: 'FIVE_K_COMPANY_HOW',
        name: '5К AI: компания — как принимается решение',
        type: 'boolean',
    },
    {
        code: 'FIVE_K_COMPANY_RIGHT',
        name: '5К AI: цена и комплект подобраны верно',
        type: 'boolean',
    },
    {
        code: 'FIVE_K_COMMAND',
        name: '5К AI: коллеги — кто будет работать',
        type: 'boolean',
    },
    {
        code: 'FIVE_K_CONCURENT',
        name: '5К AI: конкурент — критерии сравнения',
        type: 'boolean',
    },
    {
        code: 'FIVE_K_CRITERI',
        name: '5К AI: критерии выбора СПС',
        type: 'boolean',
    },
    {
        code: 'INTERLOCUTOR_ROLE',
        name: 'С кем говорили',
        type: 'enumeration',
        items: CALL_REPORT_INTERLOCUTOR_ITEMS,
    },
    {
        code: 'SPECIALIST',
        name: 'Специальность собеседника',
        type: 'enumeration',
        items: CALL_REPORT_SPECIALIST_ITEMS,
    },
    {
        code: 'SENTIMENT',
        name: 'Тон клиента',
        type: 'enumeration',
        items: CALL_REPORT_SENTIMENT_ITEMS,
    },

    // — Следующий шаг (ключевой предиктор) —
    { code: 'NEXT_STEP_SET', name: 'Следующий шаг назначен', type: 'boolean' },
    {
        code: 'NEXT_STEP',
        name: 'Следующий шаг (что/кто/когда)',
        type: 'string',
    },
    { code: 'NEXT_STEP_DATE', name: 'Дата следующего шага', type: 'datetime' },

    // — Событийные флаги и справочники —
    { code: 'PRICE_DISCUSSED', name: 'Цена обсуждалась', type: 'boolean' },
    {
        code: 'COMPETITOR_MENTIONED',
        name: 'Конкурент упомянут',
        type: 'boolean',
    },
    {
        code: 'COMPETITORS',
        name: 'Конкуренты (справочник)',
        type: 'enumeration',
        items: CALL_REPORT_COMPETITOR_ITEMS,
        isMultiple: true,
    },
    {
        code: 'OBJECTION_CATEGORIES',
        name: 'Категории возражений',
        type: 'enumeration',
        items: CALL_REPORT_OBJECTION_ITEMS,
        isMultiple: true,
    },
    {
        code: 'RISK_FLAGS',
        name: 'Риск-флаги',
        type: 'enumeration',
        items: CALL_REPORT_RISK_FLAG_ITEMS,
        isMultiple: true,
    },
    {
        code: 'REFUSAL_CATEGORY',
        name: 'Категория отказа (рыночная/исполнительская)',
        type: 'enumeration',
        items: CALL_REPORT_REFUSAL_ITEMS,
    },

    // — Метрики речи (из транскрипта) —
    {
        code: 'TALK_RATIO_PCT',
        name: 'Доля речи менеджера, % (норма 40-60)',
        type: 'integer',
    },
    {
        code: 'QUESTIONS_COUNT',
        name: 'Вопросов менеджера (норма 11-14 на discovery)',
        type: 'integer',
    },

    // — Связи с воронками и отчётностью (если удалось установить) —
    {
        code: 'DEAL_MAIN',
        name: 'ОП: основная сделка',
        type: 'crm',
        crmEntities: ['DEAL'],
    },
    {
        code: 'DEAL_PRESENTATION',
        name: 'Сделка ОП Презентации',
        type: 'crm',
        crmEntities: ['DEAL'],
    },
    {
        code: 'DEAL_XO',
        name: 'Сделка ХО',
        type: 'crm',
        crmEntities: ['DEAL'],
    },
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
    {
        code: 'WEIGHTED_SCORE',
        name: 'Взвешенная оценка 0-100 (Σ score×relevance / Σ relevance × 10)',
        type: 'integer',
    },
    {
        code: 'SCRIPT_COMPLIANCE',
        name: 'Соответствие скрипту, %',
        type: 'integer',
    },
    {
        code: 'COACHING_PRIORITY',
        name: 'Приоритет разбора (coaching)',
        type: 'enumeration',
        items: CALL_REPORT_COACHING_ITEMS,
    },
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

    // --- Проверка по регламенту (Фаза 3 rag-driven-analysis-plan.md) ---
    // Отдельный проход сверяет разговор с документами компании: скрипт,
    // регламент, факты о продукте. Считает не «в целом хорошо», а штуки:
    // сколько пунктов пропущено и сколько неверных утверждений о продукте.
    {
        code: 'COMPLIANCE_DONE',
        name: 'Проверка по регламенту выполнена',
        type: 'boolean',
    },
    {
        code: 'COMPLIANCE_SEVERITY',
        name: 'Серьёзность нарушений',
        type: 'enumeration',
        items: CALL_REPORT_COMPLIANCE_SEVERITY_ITEMS,
    },
    {
        code: 'COMPLIANCE_VIOLATIONS',
        name: 'Нарушений регламента, шт',
        type: 'integer',
    },
    {
        code: 'SCRIPT_MISSED',
        name: 'Пропущено пунктов скрипта, шт',
        type: 'integer',
    },
    {
        code: 'PRODUCT_FACT_ERRORS',
        name: 'Ошибок о продукте (фактчек), шт',
        type: 'integer',
    },
    {
        code: 'COMPLIANCE_SUMMARY',
        name: 'Проверка по регламенту (кратко)',
        type: 'string',
    },

    // — Разделы анализа (7 × актуальность/оценка/разбор/рекомендации) —
    ...buildSectionFields(),

    // — Транскрипт кусками —
    ...buildTranscriptFields(),

    // — Служебные —
    { code: 'AGENT_NAME', name: 'Имя агента-аналитика', type: 'string' },
    { code: 'AGENT_VERSION', name: 'Версия скилла агента', type: 'string' },
];

// ---------------------------------------------------------------------------
// Раскладка карточки элемента по разделам
// ---------------------------------------------------------------------------

/** Раздел карточки элемента (crm.item.details.configuration.set). */
export interface CallReportCardSection {
    /** Уникальное имя раздела в конфигурации карточки. */
    name: string;
    /** Заголовок раздела, виден пользователю. */
    title: string;
    /**
     * Поля раздела по порядку: UPPER_SNAKE — коды UF-полей смарта
     * (превращаются в ufCrm{typeId}{Code}), camelCase — системные поля
     * карточки (title, assignedById…) как есть.
     */
    codes: readonly string[];
}

/**
 * Общая (scope C) раскладка карточки — применяется установщиком, чтобы
 * поля не сваливались в кучу «Об элементе», а лежали по смысловым
 * разделам. Пользовательские личные настройки поверх неё сохраняются.
 */
export const CALL_REPORT_CARD_SECTIONS: readonly CallReportCardSection[] = [
    {
        name: 'main',
        title: 'Об элементе',
        codes: ['title', 'assignedById', 'companyId', 'contactId'],
    },
    {
        name: 'call',
        title: 'Звонок',
        codes: [
            'CALL_TYPE',
            'PRODUCTIVE',
            'CALL_DATE',
            'DURATION_SEC',
            'MANAGER',
            'INTERLOCUTOR_ROLE',
            'SPECIALIST',
            'SENTIMENT',
            'TALK_RATIO_PCT',
            'QUESTIONS_COUNT',
            'ACTIVITY_ID',
            'CALL_ID',
        ],
    },
    {
        name: 'result',
        title: 'Итоги разбора',
        codes: [
            'SCORE',
            'WEIGHTED_SCORE',
            'SCORE_EXPLANATION',
            'SUMMARY',
            'RECOMMENDATIONS',
            'EMPLOYEE_RECOMMENDATIONS',
            'SPEECH_ANALYSIS',
            'SCRIPT_COMPLIANCE',
            'COACHING_PRIORITY',
            'RESUME_GIGACHAT',
            'RECOMENDATION_GIGACHAT',
        ],
    },
    {
        name: 'sections',
        title: 'Разделы разговора',
        codes: CALL_REPORT_SECTIONS.flatMap(section =>
            ['SCORE', 'RELEVANCE', 'ANALYSIS', 'ADVICE'].map(
                suffix => `${section.code}_${suffix}`,
            ),
        ),
    },
    {
        name: 'presentation',
        title: 'Презентация: хвост и 5К',
        codes: [
            'PRESENTATION_DONE',
            'HVOST_DONE',
            'HVOST_OFFER',
            'HVOST_COMPLECT',
            'HVOST_PRICE',
            'HVOST_DECISION_DATE',
            'HVOST_DATE_AGREED',
            'HVOST_ANALYSIS',
            'HVOST_MANAGER',
            'FIVE_K_DONE',
            'FIVE_K_CLIENT_WHAT',
            'FIVE_K_CLIENT_READY',
            'FIVE_K_CLIENT_PRICE',
            'FIVE_K_COMPANY_WHO',
            'FIVE_K_COMPANY_HOW',
            'FIVE_K_COMPANY_RIGHT',
            'FIVE_K_COMMAND',
            'FIVE_K_CONCURENT',
            'FIVE_K_CRITERI',
            'FIVE_K_ANALYSIS',
            'FIVE_K_MANAGER',
        ],
    },
    {
        name: 'compliance',
        title: 'Проверка по регламенту',
        codes: [
            'COMPLIANCE_DONE',
            'COMPLIANCE_SEVERITY',
            'COMPLIANCE_VIOLATIONS',
            'SCRIPT_MISSED',
            'PRODUCT_FACT_ERRORS',
            'COMPLIANCE_SUMMARY',
        ],
    },
    {
        name: 'needs',
        title: 'Потребности и продукты',
        codes: ['NEEDS_FOUND', 'NEEDS', 'PRODUCTS_OFFERED'],
    },
    {
        name: 'objections',
        title: 'Возражения, риски, отказы',
        codes: [
            'OBJECTIONS',
            'OBJECTIONS_HANDLING',
            'OBJECTION_CATEGORIES',
            'RISK_FLAGS',
            'REFUSAL_CATEGORY',
        ],
    },
    {
        name: 'price',
        title: 'Цена и следующий шаг',
        codes: [
            'PRICE_DISCUSSED',
            'COMPETITOR_MENTIONED',
            'COMPETITORS',
            'NEXT_STEP_SET',
            'NEXT_STEP',
            'NEXT_STEP_DATE',
        ],
    },
    {
        name: 'links',
        title: 'Связи и отчётность',
        codes: [
            'DEAL_MAIN',
            'DEAL_PRESENTATION',
            'DEAL_XO',
            'KPI_ITEM_ID',
            'KPI_ITEM_STATUS',
            'HISTORY_ITEM_ID',
            'HISTORY_ITEM_STATUS',
            'RELATED_REPORTS',
        ],
    },
    {
        name: 'transcript',
        title: 'Транскрипт и служебные',
        codes: [
            'TRANSCRIPT_1',
            'TRANSCRIPT_2',
            'TRANSCRIPT_3',
            'TRANSCRIPT_4',
            'TRANSCRIPTION_ID',
            'AGENT_NAME',
            'AGENT_VERSION',
        ],
    },
];

/**
 * UF-имя поля для userfieldconfig: UF_CRM_{typeId}_{code}.
 * ВАЖНО: typeId — id смарт-типа из crm.type.list (в доках Bitrix: id=7,
 * entityTypeId=177 → UF_CRM_7_...). entityTypeId сюда передавать НЕЛЬЗЯ.
 */
export function buildCallReportUfName(
    typeId: number | string,
    code: string,
): string {
    return `UF_CRM_${typeId}_${code}`;
}

/**
 * Имя поля в crm.item.* API: camelCase от UF-имени
 * (UF_CRM_13_PERIOD_FROM → ufCrm13PeriodFrom — см. smart-act.service).
 * typeId — id смарт-типа из crm.type.list (НЕ entityTypeId).
 */
export function buildCallReportItemFieldName(
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
