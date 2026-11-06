import {
    CALL_REPORT_SECTIONS,
    CALL_REPORT_CALL_TYPE_CODES,
    CALL_REPORT_COACHING_CODES,
    CALL_REPORT_COMPETITOR_CODES,
    CALL_REPORT_INTERLOCUTOR_CODES,
    CALL_REPORT_REFUSAL_CODES,
    CALL_REPORT_SENTIMENT_CODES,
    CALL_REPORT_SPECIALIST_CODES,
} from '@lib/call-lib';
import {
    DEEP_ANALYSIS_CORE_RULES,
    FIVE_K_CHECKLIST_SPEC,
    FIVE_K_ITEMS_SCHEMA,
    HVOST_CHECKLIST_SPEC,
    FLOW_SCHEMA,
    HVOST_STEPS_SCHEMA,
    NEXT_STEP_SCHEMA,
    OBJECTION_SCHEMA,
    OBJECTION_TIMECODE_SPEC,
    SECTION_FIELDS_SPEC,
    SECTION_ITEM_SCHEMA,
} from './call-deep-analysis.contract';
import {
    FORM_FACTS_PROPERTIES,
    FORM_FACTS_REQUIRED,
    FORM_FACTS_SPEC,
    MOVEMENT_FACTS_PROPERTIES,
    MOVEMENT_FACTS_REQUIRED,
    MOVEMENT_FACTS_SPEC,
} from './call-report-facts.contract';
import {
    RISK_EVIDENCE_LIST_SCHEMA,
    RISK_FLAGS_SCHEMA,
    RISK_FLAGS_SPEC,
} from './call-risk-flags.contract';

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
                    description:
                        'Код раздела; каждый код — не более одной записи в sections',
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

/**
 * Продвижение сделки по звонку (раздел 7.1 материалов методики; ядро для
 * всех порталов с v3.0): шкала 1–5 с обязательным комментарием; null — для
 * типа звонка не применимо.
 */
export const DEAL_PROGRESS_SCHEMA: Record<string, unknown> = {
    type: ['object', 'null'],
    properties: {
        score: { type: 'integer', minimum: 1, maximum: 5 },
        before: { type: 'string' },
        after: { type: 'string' },
        why: { type: 'string' },
        whyNotHigher: { type: 'string' },
    },
    required: ['score', 'before', 'after', 'why', 'whyNotHigher'],
    additionalProperties: false,
};

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
        refusalReason: { type: ['string', 'null'] },
        nextStep: NEXT_STEP_SCHEMA,
        dealProgress: DEAL_PROGRESS_SCHEMA,
        productive: { type: 'boolean' },
        riskFlags: RISK_FLAGS_SCHEMA,
        // Доказательства флагов (focus-v2.4): флаг без цитаты снимается.
        riskEvidence: RISK_EVIDENCE_LIST_SCHEMA,
        // «Хвост» и «5К» — только для презентаций/решений, иначе null
        // (boolean — фильтры смарта; *_Analysis — отдельные записи в
        // таймлайн элемента).
        hvostDone: { type: ['boolean', 'null'] },
        hvostAnalysis: { type: ['string', 'null'] },
        hvostSteps: HVOST_STEPS_SCHEMA,
        fiveKDone: { type: ['boolean', 'null'] },
        fiveKAnalysis: { type: ['string', 'null'] },
        fiveKItems: FIVE_K_ITEMS_SCHEMA,
        flow: FLOW_SCHEMA,
        // Факты для отчётов руководителю (focus-v3.1, 06.11.2026): исход,
        // сбои, цены, допродажа.
        ...MOVEMENT_FACTS_PROPERTIES,
    },
    required: [
        'sections',
        'objections',
        'priceDiscussed',
        'competitors',
        'refusalCategory',
        'refusalReason',
        'nextStep',
        'dealProgress',
        'productive',
        'riskFlags',
        'riskEvidence',
        'hvostDone',
        'hvostAnalysis',
        'hvostSteps',
        'fiveKDone',
        'fiveKAnalysis',
        'fiveKItems',
        'flow',
        ...MOVEMENT_FACTS_REQUIRED,
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
  цитата, категория и тема (topic — см. факты ниже). Считай возражением и
  СКРЫТОЕ сопротивление: «у нас уже есть
  Консультант», «пришлите на почту», «надо посоветоваться».
  ${OBJECTION_TIMECODE_SPEC}
- priceDiscussed — обсуждалась ли цена фактически.
- competitors — конкуренты, упомянутые клиентом (коды справочника).
- refusalCategory — при отказе: РЫНОЧНАЯ причина или ИСПОЛНИТЕЛЬСКАЯ; null без отказа.
- refusalReason — ПРИЧИНА ОТКАЗА СЛОВАМИ КЛИЕНТА, одно-два предложения по
  тому, что реально прозвучало: «работают с Консультантом, договор оплачен
  до декабря», «руководитель не согласовал бюджет до конца года». Не код и
  не пересказ этапа. Заполняй и при мягком отказе («не интересно»,
  «перезвоните через год»), если причина в разговоре названа. Причина не
  прозвучала или отказа не было — null, НЕ ДОГАДЫВАЙСЯ: это поле уходит в
  карточку как факт разговора.
- nextStep.set — договорились ли о КОНКРЕТНОМ шаге («клиент подумает» — не шаг);
  description — что и когда; date — YYYY-MM-DD или null; time — время
  контакта («11:00», «после обеда») или null; goal — цель контакта («узнать
  решение», «показать директору») или null; clientAction — что клиент делает
  до контакта, managerAction — что делает менеджер; не прозвучало — null.
  Полный шаг — дата, время, цель и действия обеих сторон.
- productive — состоялся ли контакт и есть ли продвижение по сделке.
- dealProgress — ПРОДВИЖЕНИЕ СДЕЛКИ по этому звонку, шкала 1–5: 1 — ничего не
  изменилось («снова подумать», причина не выявлена, обязательств нет);
  2 — новая информация, но неопределённость (мнение получено, ЛПР определён,
  общий барьер, назначен контакт); 3 — конкретный барьер и действие по его
  снятию (ЛПР и критерии известны, клиент подтвердил ценность, шаг ведёт к
  решению); 4 — принципиальное согласие (комплект, цена, срок в целом
  согласованы, осталось оформление); 5 — закрыто (счёт, дата оплаты,
  возражений нет). Правила: активность менеджера ≠ результат; новый звонок
  ≠ продвижение; обязательство клиента сильнее обязательства менеджера;
  интерес («удобно», «понравилось») ≠ намерение купить; «пришлите счёт,
  покажу директору» — не выше 3; объективные ограничения (бюджетный
  процесс, закупка) оценку не снижают, если коммерческое решение принято.
  Поля: before — состояние до звонка, after — после, why — почему такая
  оценка, whyNotHigher — почему не выше. Применимо к доработке, решению,
  оплате и презентации, дошедшей до условий; для холодного, звонка под
  показ, заявки с сайта, приглашения на мероприятие и нерелевантного — null.
- hvostDone — ТОЛЬКО для презентации/звонка по решению: пройден ли «хвост»
  после демонстрации (вопросы ценности, кто будет работать, цена комплекта,
  механизм решения, договорённость о КП и ДАТЕ следующего звонка). Частично
  или «поработайте, я перезвоню» без даты — false. Для других типов — null.
- hvostAnalysis — вместе с hvostDone: разбор прохождения хвоста по этапам,
  каждый с новой строки, по ПЯТИ блокам «Хвоста» и в том же порядке, что в
  анкете менеджера: «1. ЖЕЛАНИЕ РАБОТАТЬ С ГАРАНТОМ — ✓/✗ …», «2. ЧТО
  ПРЕДЛОЖИЛИ — …», «3. РЕАКЦИЯ НА ЦЕНУ — …», «4. ПРОЦЕСС ПРИНЯТИЯ РЕШЕНИЯ —
  …», «5. ВЫХОД НА РЕШЕНИЕ — …»; в конце одна строка вывода. Для других
  типов — null.
- fiveKDone — ТОЛЬКО для презентации/звонка по решению: закрыты ли все пять
  «К» (КЛИЕНТ, КОМПАНИЯ, КОЛЛЕГИ, КОНКУРЕНТ, КРИТЕРИИ ВЫБОРА). Хотя бы один
  блок не выяснен — false. Для других типов — null.
- fiveKAnalysis — вместе с fiveKDone: по каждому блоку с новой строки, что
  выяснено (с конкретикой из разговора) или что осталось невыясненным:
  «КЛИЕНТ — …», «КОМПАНИЯ — …», «КОЛЛЕГИ — …», «КОНКУРЕНТ — …»,
  «КРИТЕРИИ ВЫБОРА — …». Для других типов — null. НЕВЫЯСНЕННОЕ — ТОЖЕ
  РЕЗУЛЬТАТ: если ни одна «К» не выяснена, всё равно перечисли их все с
  пометкой «не выяснено» — пустой разбор при заполненном итоге в карточке
  выглядит как сбой системы.
- hvostSteps — гранулярный «Хвост», ТЕ ЖЕ блоки, которые менеджер заполняет
  в своей анкете (true = тема раскрыта в разговоре, false = должна была
  прозвучать, но не прозвучала, null = тип звонка не презентация/решение):
${HVOST_CHECKLIST_SPEC}
- fiveKItems — гранулярные «5К», те же блоки анкеты менеджера
  (true = выяснено в разговоре, false = не выяснено, null = не тот тип
  звонка):
${FIVE_K_CHECKLIST_SPEC}
- flow — черновик отчёта менеджера: resultStatus result/noresult/expired;
  noresultReasonCode только при noresult (secretar/nopickup/nonumber/busy/
  noresult_notime/nocontact/giveup/bay/wrong/auto), иначе null; plan.isPlanned —
  будет ли следующий контакт; plan.typeCode при isPlanned (cold/warm/
  presentation/hot/moneyAwait/supply), иначе null; plan.name — короткое название;
  plan.deadlineDate — YYYY-MM-DD или null.

${MOVEMENT_FACTS_SPEC}

${RISK_FLAGS_SPEC}`;

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
