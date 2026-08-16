import {
    CALL_REPORT_SECTIONS,
    CALL_REPORT_COACHING_CODES,
    CALL_REPORT_COMPETITOR_CODES,
    CALL_REPORT_INTERLOCUTOR_CODES,
    CALL_REPORT_REFUSAL_CODES,
    CALL_REPORT_RISK_FLAG_CODES,
    CALL_REPORT_SENTIMENT_CODES,
    CALL_REPORT_SPECIALIST_CODES,
} from '@lib/call-lib';
import {
    DEEP_ANALYSIS_CORE_RULES,
    FLOW_SCHEMA,
    NEXT_STEP_SCHEMA,
    OBJECTION_SCHEMA,
    SECTION_FIELDS_SPEC,
    SECTION_ITEM_SCHEMA,
} from './call-deep-analysis.contract';

/**
 * Контракт МНОГОСЛОЙНОГО разбора (Фаза 2 плана
 * ai/tasks/call-analysis-v2-plan.md): вместо одного гигантского вызова —
 * три ФОКУС-вызова с узкими схемами + синтез. Каждый фокус отвечает только
 * за свои разделы и факты, поэтому глубже прорабатывает их и меньше
 * галлюцинирует; синтез собирает итоговую картину по выжимкам фокусов.
 *
 * Разделы смарта распределены между фокусами БЕЗ пересечений и БЕЗ пропусков
 * (проверяется тестом): FORM — форма разговора, CONTENT — содержание
 * продажи, MOVEMENT — движение сделки.
 */

export type CallFocusKey = 'form' | 'content' | 'movement';

/** Разделы каждого фокуса (union == все коды разделов смарта). */
export const FOCUS_SECTION_CODES: Record<CallFocusKey, readonly string[]> = {
    form: ['GREETING'],
    content: ['NEEDS', 'PRESENTATION'],
    movement: ['OBJECTIONS', 'PRICE', 'CLOSING', 'REFUSAL'],
};

/** Каталог разделов конкретного фокуса для промпта. */
function focusCatalog(focus: CallFocusKey): string {
    return CALL_REPORT_SECTIONS.filter(section =>
        FOCUS_SECTION_CODES[focus].includes(section.code),
    )
        .map(section => `- '${section.code}' — ${section.title}`)
        .join('\n');
}

/** sections-подсхема, ограниченная кодами фокуса. */
function focusSectionsSchema(focus: CallFocusKey): Record<string, unknown> {
    return {
        type: 'array',
        items: {
            ...SECTION_ITEM_SCHEMA,
            properties: {
                ...SECTION_ITEM_SCHEMA.properties,
                section: {
                    type: 'string',
                    enum: [...FOCUS_SECTION_CODES[focus]],
                },
            },
        },
    };
}

// ---------------------------------------------------------------------------
// ФОКУС «ФОРМА»: вход в разговор, тон, речь. Оценивается всегда.
// ---------------------------------------------------------------------------

export const FOCUS_FORM_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        sections: focusSectionsSchema('form'),
        speechAnalysis: { type: ['string', 'null'] },
        sentiment: {
            type: ['string', 'null'],
            enum: [...CALL_REPORT_SENTIMENT_CODES, null],
        },
        interlocutorRole: {
            type: ['string', 'null'],
            enum: [...CALL_REPORT_INTERLOCUTOR_CODES, null],
        },
        specialist: {
            type: ['string', 'null'],
            enum: [...CALL_REPORT_SPECIALIST_CODES, null],
        },
    },
    required: [
        'sections',
        'speechAnalysis',
        'sentiment',
        'interlocutorRole',
        'specialist',
    ],
    additionalProperties: false,
};

export const FOCUS_FORM_PROMPT = `${DEEP_ANALYSIS_CORE_RULES}

ТВОЙ ФОКУС В ЭТОМ ЗАПРОСЕ — ТОЛЬКО ФОРМА РАЗГОВОРА. Не оценивай содержание
продажи (потребности, презентацию, возражения, цену) — этим занимаются другие
проходы разбора. Твоя зона:
${focusCatalog('form')}

${SECTION_FIELDS_SPEC}

ДОПОЛНИТЕЛЬНЫЕ ПОЛЯ ТВОЕГО ФОКУСА
- speechAnalysis — разбор речи: структура спича, приём «свойство-связка-выгода»,
  темп, слова-паразиты, заученность, соотношение монолога и диалога.
- sentiment — общий тон клиента в разговоре.
- interlocutorRole — с кем в итоге говорили: ЛПР / пользователь / секретарь / другое.
- specialist — специальность собеседника ПО ЛЕКСИКЕ разговора: проводки, НДС,
  1С, отчётность — бухгалтер; договоры, иски, претензии, судебная практика —
  юрист; кадры, приказы, отпуска, трудовые споры — кадровик; управление
  компанией и решения — руководитель. Явных признаков нет — null, не гадай.
  Если в контексте CRM указана должность собеседника — используй её как
  подсказку, но верь лексике разговора больше.`;

// ---------------------------------------------------------------------------
// ФОКУС «СОДЕРЖАНИЕ»: потребности и презентация. Главный вопрос — уместность.
// ---------------------------------------------------------------------------

export const FOCUS_CONTENT_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        sections: focusSectionsSchema('content'),
        needsFound: { type: 'boolean' },
        needs: { type: 'array', items: { type: 'string' } },
        presentationDone: { type: 'boolean' },
        productsOffered: { type: 'array', items: { type: 'string' } },
    },
    required: [
        'sections',
        'needsFound',
        'needs',
        'presentationDone',
        'productsOffered',
    ],
    additionalProperties: false,
};

export const FOCUS_CONTENT_PROMPT = `${DEEP_ANALYSIS_CORE_RULES}

ТВОЙ ФОКУС В ЭТОМ ЗАПРОСЕ — ТОЛЬКО СОДЕРЖАНИЕ ПРОДАЖИ. Не оценивай приветствие,
тон и работу с ценой — этим занимаются другие проходы разбора. Твоя зона:
${focusCatalog('content')}

ГЛАВНЫЙ ВОПРОС ФОКУСА: были ли выявлены потребности и была ли презентация —
и УМЕСТНО ли это для данного этапа (смотри контекст CRM в сообщении
пользователя). Отсутствие презентации на этапе решения — норма, а не провал;
презентация без выявленных потребностей — «стрельба вслепую», отметь это.
Презентация под потребности клиента — плюс по умолчанию.

${SECTION_FIELDS_SPEC}

ДОПОЛНИТЕЛЬНЫЕ ПОЛЯ ТВОЕГО ФОКУСА
- needsFound / presentationDone — было ли это фактически.
- needs — выявленные потребности клиента, по одной на пункт.
- productsOffered — что именно предлагали, по одному на пункт.`;

// ---------------------------------------------------------------------------
// ФОКУС «ДВИЖЕНИЕ СДЕЛКИ»: возражения, цена, закрытие, следующий шаг.
// ---------------------------------------------------------------------------

export const FOCUS_MOVEMENT_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        sections: focusSectionsSchema('movement'),
        objections: { type: 'array', items: OBJECTION_SCHEMA },
        priceDiscussed: { type: 'boolean' },
        competitors: {
            type: 'array',
            items: { type: 'string', enum: [...CALL_REPORT_COMPETITOR_CODES] },
        },
        refusalCategory: {
            type: ['string', 'null'],
            enum: [...CALL_REPORT_REFUSAL_CODES, null],
        },
        nextStep: NEXT_STEP_SCHEMA,
        productive: { type: 'boolean' },
        riskFlags: {
            type: 'array',
            items: { type: 'string', enum: [...CALL_REPORT_RISK_FLAG_CODES] },
        },
        // «Хвост» и «5К» — только для презентаций/решений, иначе null
        // (boolean — фильтры смарта; *_Analysis — отдельные записи в
        // таймлайн элемента).
        hvostDone: { type: ['boolean', 'null'] },
        hvostAnalysis: { type: ['string', 'null'] },
        fiveKDone: { type: ['boolean', 'null'] },
        fiveKAnalysis: { type: ['string', 'null'] },
        flow: FLOW_SCHEMA,
    },
    required: [
        'sections',
        'objections',
        'priceDiscussed',
        'competitors',
        'refusalCategory',
        'nextStep',
        'productive',
        'riskFlags',
        'hvostDone',
        'hvostAnalysis',
        'fiveKDone',
        'fiveKAnalysis',
        'flow',
    ],
    additionalProperties: false,
};

export const FOCUS_MOVEMENT_PROMPT = `${DEEP_ANALYSIS_CORE_RULES}

ТВОЙ ФОКУС В ЭТОМ ЗАПРОСЕ — ТОЛЬКО ДВИЖЕНИЕ СДЕЛКИ: сопротивление клиента,
цена, закрытие разговора и следующий шаг. Не оценивай приветствие и
презентацию — этим занимаются другие проходы разбора. Твоя зона:
${focusCatalog('movement')}

ЖЕЛЕЗНОЕ ПРАВИЛО ФАКТОВ: если тема в разговоре НЕ звучала (цена не
обсуждалась, возражений не было, конкуренты не упоминались) — ставь
priceDiscussed=false, пустые массивы, relevance раздела по ситуации этапа —
и НЕ выдумывай разбор несуществующей темы.

${SECTION_FIELDS_SPEC}

ДОПОЛНИТЕЛЬНЫЕ ПОЛЯ ТВОЕГО ФОКУСА
- objections — каждое возражение: формулировка, отработка, удалось ли, дословная
  цитата, категория. Считай возражением и СКРЫТОЕ сопротивление: «у нас уже есть
  Консультант», «пришлите на почту», «надо посоветоваться».
- priceDiscussed — обсуждалась ли цена фактически.
- competitors — конкуренты, упомянутые клиентом (коды справочника).
- refusalCategory — при отказе: РЫНОЧНАЯ причина или ИСПОЛНИТЕЛЬСКАЯ; null без отказа.
- nextStep.set — договорились ли о КОНКРЕТНОМ шаге («клиент подумает» — не шаг);
  description — что и когда; date — YYYY-MM-DD или null.
- productive — состоялся ли контакт и есть ли продвижение по сделке.
- riskFlags — что должно попасть на стол руководителю.
- hvostDone — ТОЛЬКО для презентации/звонка по решению: пройден ли «хвост»
  после демонстрации (вопросы ценности, кто будет работать, цена комплекта,
  механизм решения, договорённость о КП и ДАТЕ следующего звонка). Частично
  или «поработайте, я перезвоню» без даты — false. Для других типов — null.
- hvostAnalysis — вместе с hvostDone: разбор прохождения хвоста по этапам,
  каждый с новой строки: «1. Вопросы ценности — ✓/✗ что было/чего не хватило»,
  «2. Кто будет работать — …», «3. Цена комплекта — …», «4. Механизм решения
  и дата — …»; в конце одна строка вывода. Для других типов — null.
- fiveKDone — ТОЛЬКО для презентации/звонка по решению: закрыты ли все 5К
  (Клиент: что хочет/готов/цена; Компания: кто и как решает; Коллеги;
  Конкурент; Критерии выбора). Хотя бы один «К» не выяснен — false.
  Для других типов — null.
- fiveKAnalysis — вместе с fiveKDone: по каждой «К» с новой строки, что
  выяснено (с конкретикой из разговора) или что осталось невыясненным:
  «Клиент — …», «Компания — …», «Коллеги — …», «Конкурент — …»,
  «Критерии выбора — …». Для других типов — null.
- flow — черновик отчёта менеджера: resultStatus result/noresult/expired;
  noresultReasonCode только при noresult (secretar/nopickup/nonumber/busy/
  noresult_notime/nocontact/giveup/bay/wrong/auto), иначе null; plan.isPlanned —
  будет ли следующий контакт; plan.typeCode при isPlanned (cold/warm/
  presentation/hot/moneyAwait/supply), иначе null; plan.name — короткое название;
  plan.deadlineDate — YYYY-MM-DD или null.`;

// ---------------------------------------------------------------------------
// СИНТЕЗ: итоговая картина по выжимкам трёх фокусов.
// ---------------------------------------------------------------------------

export const FOCUS_SYNTHESIS_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        score: { type: 'integer', minimum: 1, maximum: 10 },
        scoreExplanation: { type: ['string', 'null'] },
        recommendations: { type: 'array', items: { type: 'string' } },
        employeeRecommendations: { type: ['string', 'null'] },
        coachingPriority: {
            type: ['string', 'null'],
            enum: [...CALL_REPORT_COACHING_CODES, null],
        },
        scriptCompliance: {
            type: ['integer', 'null'],
            minimum: 0,
            maximum: 100,
        },
    },
    required: [
        'summary',
        'score',
        'scoreExplanation',
        'recommendations',
        'employeeRecommendations',
        'coachingPriority',
        'scriptCompliance',
    ],
    additionalProperties: false,
};

export const FOCUS_SYNTHESIS_PROMPT = `${DEEP_ANALYSIS_CORE_RULES}

ТВОЯ ЗАДАЧА — ИТОГОВАЯ КАРТИНА ЗВОНКА. Три специализированных разбора уже
выполнены (форма разговора, содержание продажи, движение сделки) — их выводы
приложены в сообщении пользователя вместе с транскриптом. Не пересматривай их
оценки — собери из них целое:
- summary — два смысловых блока в одном тексте. Сначала канва разговора: кто
  кому звонил, что предложили, чем закончилось, с именами и конкретикой.
  Затем — что обещали мы, что обещал клиент, и какие вопросы менеджер задал.
  Без оценок.
- score (1-10) — общая оценка звонка в контексте его этапа, только по
  применимым разделам; опирайся на оценки фокусов, не пересчитывая их.
- scoreExplanation — из чего сложилась оценка: сильные стороны, слабые, что
  перевесило.
- recommendations — 3-5 главных выводов по звонку, форматом «приём → реплика →
  зачем». Первым пунктом — ЗАГОТОВКА ПЕРВОЙ ФРАЗЫ СЛЕДУЮЩЕГО КОНТАКТА.
- employeeRecommendations — что сотруднику развивать на дистанции.
- coachingPriority — срочность разбора с руководителем.
- scriptCompliance (0-100) — соответствие скрипту из материалов; null, если
  скрипта нет.`;

/** Компактная выжимка результата фокуса для синтеза. */
export function renderFocusDigest(
    label: string,
    result: Record<string, unknown> | null,
): string {
    if (!result) return `${label}: проход не удался, данных нет.`;
    const toText = (value: unknown): string =>
        typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : '';
    const sections = Array.isArray(result.sections)
        ? (result.sections as Record<string, unknown>[])
              .map(section => {
                  const score = toText(section.score);
                  const note =
                      toText(section.analysis) || toText(section.asWas);
                  return `  ${toText(section.section)}: ${score ? `${score}/10` : '—'}; ${note.slice(0, 300)}`;
              })
              .join('\n')
        : '';
    return `${label}:\n${sections}`;
}
