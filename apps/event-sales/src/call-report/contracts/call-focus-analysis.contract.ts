import {
    CALL_REPORT_CALL_TYPE_CODES,
    CALL_REPORT_COACHING_CODES,
    CALL_REPORT_INTERLOCUTOR_CODES,
    CALL_REPORT_SENTIMENT_CODES,
    CALL_REPORT_SPECIALIST_CODES,
} from '@lib/call-lib';
import {
    DEEP_ANALYSIS_CORE_RULES,
    SECTION_FIELDS_SPEC,
} from './call-deep-analysis.contract';
import {
    focusCatalog,
    focusSectionsSchema,
} from './call-focus-sections.contract';
import {
    FORM_FACTS_PROPERTIES,
    FORM_FACTS_REQUIRED,
    CONTENT_MOMENTS_PROPERTIES,
    CONTENT_MOMENTS_REQUIRED,
    CONTENT_MOMENTS_SPEC,
    FORM_FACTS_SPEC,
} from './call-report-facts.contract';

/**
 * Контракт МНОГОСЛОЙНОГО разбора (Фаза 2 плана
 * ai/tasks/call-analysis-v2-plan.md): вместо одного гигантского вызова —
 * четыре ФОКУС-вызова с узкими схемами + синтез. Каждый фокус отвечает только
 * за свои разделы и факты, поэтому глубже прорабатывает их и меньше
 * галлюцинирует; синтез собирает итоговую картину по выжимкам фокусов.
 *
 * Разделы смарта распределены между фокусами БЕЗ пересечений и БЕЗ пропусков
 * (проверяется тестом): FORM — форма разговора, CONTENT — содержание
 * продажи, MOVEMENT — возражения и цена, CLOSING — закрытие и следующий шаг.
 * Зоны — в call-focus-sections.contract.ts, проходы MOVEMENT и CLOSING — в
 * call-focus-deal.contract.ts; отсюда они переэкспортируются, чтобы остальной
 * код брал весь контракт фокусов из одного места.
 */

export {
    FOCUS_KEYS,
    FOCUS_SECTION_CODES,
    type CallFocusKey,
} from './call-focus-sections.contract';
export {
    DEAL_PROGRESS_SCHEMA,
    FOCUS_CLOSING_PROMPT,
    FOCUS_CLOSING_SCHEMA,
    FOCUS_MOVEMENT_PROMPT,
    FOCUS_MOVEMENT_SCHEMA,
} from './call-focus-deal.contract';

// ---------------------------------------------------------------------------
// ФОКУС «ФОРМА»: вход в разговор, тон, речь. Оценивается всегда.
// ---------------------------------------------------------------------------

export const FOCUS_FORM_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        sections: focusSectionsSchema('form'),
        speechAnalysis: { type: ['string', 'null'] },
        // Оценка LLM (транскрипт без разметки ролей — точный подсчёт кодом
        // невозможен до стерео-диаризации). Код перекрывает эти числа,
        // когда есть размеченный диалог (внешний агент-контур).
        talkRatioPct: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
        questionsCount: { type: ['integer', 'null'], minimum: 0 },
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
        // Самопредставление (focus-v3.1, 06.11.2026) — для отчётов руководителю.
        ...FORM_FACTS_PROPERTIES,
    },
    required: [
        'sections',
        'speechAnalysis',
        'talkRatioPct',
        'questionsCount',
        'sentiment',
        'interlocutorRole',
        'specialist',
        ...FORM_FACTS_REQUIRED,
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
- talkRatioPct — оцени долю речи МЕНЕДЖЕРА в разговоре, целое 0-100 (%).
  Реплики менеджера определяй по смыслу (кто продаёт/задаёт вопросы про
  систему). Норма 40-60; монолог менеджера >70 — тревожный признак.
  Не можешь отличить роли (обрывок, автоответчик) — null.
- questionsCount — сколько вопросов задал МЕНЕДЖЕР клиенту за разговор
  (целое, только явные вопросы менеджера, не клиента). Не определить — null.
- sentiment — общий тон клиента в разговоре.
- interlocutorRole — с кем в итоге говорили: ЛПР / пользователь / секретарь / другое.
- specialist — специальность собеседника ПО ЛЕКСИКЕ разговора: проводки, НДС,
  1С, отчётность — бухгалтер; договоры, иски, претензии, судебная практика —
  юрист; кадры, приказы, отпуска, трудовые споры — кадровик; управление
  компанией и решения — руководитель. Явных признаков нет — null, не гадай.
  Если в контексте CRM указана должность собеседника — используй её как
  подсказку, но верь лексике разговора больше.
${FORM_FACTS_SPEC}`;

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
        ...CONTENT_MOMENTS_PROPERTIES,
    },
    required: [
        'sections',
        'needsFound',
        'needs',
        'presentationDone',
        'productsOffered',
        ...CONTENT_MOMENTS_REQUIRED,
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
- productsOffered — что именно предлагали, по одному на пункт.
${CONTENT_MOMENTS_SPEC}`;

// ---------------------------------------------------------------------------
// СИНТЕЗ: итоговая картина по выжимкам четырёх фокусов.
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
        // Уточнение типа звонка ПОСЛЕ полного разбора: дешёвый классификатор
        // видел выжимку, синтез — весь разговор, паспорт и материалы.
        callTypeRefined: {
            type: ['string', 'null'],
            enum: [...CALL_REPORT_CALL_TYPE_CODES, null],
        },
        callTypeReason: { type: ['string', 'null'] },
    },
    required: [
        'summary',
        'score',
        'scoreExplanation',
        'recommendations',
        'employeeRecommendations',
        'coachingPriority',
        'scriptCompliance',
        'callTypeRefined',
        'callTypeReason',
    ],
    additionalProperties: false,
};

export const FOCUS_SYNTHESIS_PROMPT = `${DEEP_ANALYSIS_CORE_RULES}

ТВОЯ ЗАДАЧА — ИТОГОВАЯ КАРТИНА ЗВОНКА. Четыре специализированных разбора уже
выполнены (форма разговора, содержание продажи, возражения и цена, закрытие и
следующий шаг) — их выводы приложены в сообщении пользователя вместе с
транскриптом. Не пересматривай их оценки — собери из них целое:
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
  скрипта нет.
- callTypeRefined — ТИП ЗВОНКА ПО ФАКТУ РАЗГОВОРА. Тип от классификатора дан
  в сообщении пользователя как подсказка; ты видел весь разговор целиком —
  если он явно другой (в «звонке» на самом деле показали систему и прошли
  хвост — это 'presentation'; клиент «подумает» после показа — 'refine';
  обсуждали условия и сроки покупки — 'decision'; менеджер звал на форум,
  семинар, вебинар или своё мероприятие компании и договаривался о
  регистрации, а продукт был лишь поводом — 'event_invite'; упомянутое
  мимоходом мероприятие тип не меняет), верни верный код.
  Совпадает с подсказкой — верни тот же код. 'other' — только если разговор
  про продукт, но ни к одному этапу не относится (сопровождение,
  техподдержка, организационное); для состоявшегося разговора о продаже
  'other' почти всегда ошибка.
- callTypeReason — одна фраза: по каким признакам разговора определён тип.`;

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
