/**
 * Привязки задач к CRM-сущностям (поле задачи `UF_CRM_TASK`).
 *
 * Формат значений Битрикса: `L_12` (лид), `D_34` (сделка), `C_56` (контакт),
 * `CO_78` (компания). Утилита — единая точка сборки/разбора этих строк,
 * чтобы magic strings вида `'CO_' + id` не расползались по flow-сервисам.
 *
 * Значение id может быть и ссылкой на результат batch-команды
 * (`$result[cmdKey]`) — Битрикс подставляет токен и как подстроку,
 * поэтому `taskCrmBinding('DEAL', '$result[new_deal]')` валиден.
 */

export const TASK_CRM_BINDING_PREFIX = {
    LEAD: 'L',
    DEAL: 'D',
    CONTACT: 'C',
    COMPANY: 'CO',
} as const;

export type TaskCrmBindingEntity = keyof typeof TASK_CRM_BINDING_PREFIX;

export interface ParsedTaskCrmBinding {
    entity: TaskCrmBindingEntity;
    /** Числовой id либо `$result[...]`-токен — как хранится в строке. */
    id: string;
}

/** Собирает значение для `UF_CRM_TASK`: `taskCrmBinding('COMPANY', 12)` → `CO_12`. */
export function taskCrmBinding(
    entity: TaskCrmBindingEntity,
    id: number | string,
): string {
    return `${TASK_CRM_BINDING_PREFIX[entity]}_${id}`;
}

/**
 * Разбирает значение `UF_CRM_TASK`. Возвращает null для чужих/неизвестных
 * форматов (например, смарт-процессы `T{typeId}_{id}`) — вызывающий код
 * обязан сохранять такие значения как есть, а не отбрасывать.
 */
export function parseTaskCrmBinding(raw: string): ParsedTaskCrmBinding | null {
    const match = /^(CO|L|D|C)_(.+)$/.exec(raw);
    if (!match) return null;

    const entity = (
        Object.entries(TASK_CRM_BINDING_PREFIX) as [
            TaskCrmBindingEntity,
            string,
        ][]
    ).find(([, prefix]) => prefix === match[1])?.[0];
    if (!entity) return null;

    return { entity, id: match[2] };
}

/**
 * Объединяет наборы привязок без дублей, сохраняя порядок первого вхождения.
 * Неизвестные форматы (смарты и т.п.) проходят как есть.
 */
export function mergeTaskCrmBindings(
    ...bindingSets: (readonly string[] | undefined)[]
): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const set of bindingSets) {
        for (const value of set ?? []) {
            if (seen.has(value)) continue;
            seen.add(value);
            result.push(value);
        }
    }
    return result;
}
