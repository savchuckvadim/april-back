/**
 * Вид ХОЛОДНОЙ работы и его СЛОВО В ЗАГОЛОВКЕ ЗАДАЧИ.
 *
 * Это контракт с фреймом, а не украшение: фронт определяет тип события
 * разбором заголовка (`parseTaskTitle`), поэтому слово в заголовке —
 * единственный канал, по которому вид холодной работы доезжает до
 * менеджера и обратно в отчёт.
 *
 *   «Холодный обзвон. Заявка. {название}» → eventType `xoRequest`
 *   «Холодный обзвон. Лид. {название}»    → eventType `xoLead`
 *   «Холодный обзвон {название}»          → eventType `xo`
 *
 * (Префикс «Холодный обзвон» и «Холодный звонок» фронт понимает одинаково —
 * оба означают холодную работу; отличает виды именно второе слово.)
 *
 * Вид РЕШАЕТСЯ В БИТРИКСЕ: робот запускает хук «лид → работа» с признаком
 * (`workKind`, либо legacy-флаг `isRequest`), а бэк только переносит решение
 * в заголовок. По полям лида вид не угадывается — автодетект остаётся лишь
 * запасным вариантом для роботов, которые признак не шлют.
 */
export const LEAD_WORK_KIND = {
    /** Настоящий холодный обзвон: клиент нас не ждёт. */
    cold: 'cold',
    /** Заявка: клиент обратился сам. */
    request: 'request',
    /** Входящий лид/обращение. */
    lead: 'lead',
} as const;

export type LeadWorkKind = (typeof LEAD_WORK_KIND)[keyof typeof LEAD_WORK_KIND];

export const LEAD_WORK_KIND_VALUES = Object.values(
    LEAD_WORK_KIND,
) as LeadWorkKind[];

/**
 * Слово-признак вида в заголовке задачи; `null` — слова нет (обычный ХО).
 * Меняя эти строки, обязательно синхронизируй `parseTaskTitle` на фронте.
 */
export const LEAD_WORK_KIND_TITLE_WORD: Record<LeadWorkKind, string | null> = {
    [LEAD_WORK_KIND.cold]: null,
    [LEAD_WORK_KIND.request]: 'Заявка',
    [LEAD_WORK_KIND.lead]: 'Лид',
};

/**
 * Заголовок холодной задачи: «{префикс}. {Слово}. {название}» либо
 * «{префикс} {название}» для обычного ХО.
 *
 * Одна функция на оба места, где такие задачи рождаются (хук «лид → работа»
 * и планирование следующего шага в event-report), — иначе форматы разъедутся
 * и фронт перестанет узнавать заявку в одном из них.
 */
export function buildColdTaskTitle(
    prefix: string,
    kind: LeadWorkKind,
    eventName: string,
): string {
    const word = LEAD_WORK_KIND_TITLE_WORD[kind];
    const name = eventName.trim();
    return word
        ? `${prefix}. ${word}. ${name}`.trim()
        : `${prefix} ${name}`.trim();
}

/** Название типа задачи без имени события — для event-report TITLE. */
export function coldTaskTypeName(prefix: string, kind: LeadWorkKind): string {
    const word = LEAD_WORK_KIND_TITLE_WORD[kind];
    return word ? `${prefix}. ${word}.` : prefix;
}
