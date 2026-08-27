/** Типы сущностей, разрешённые в crm-поле Битрикса (SETTINGS). */
export const CRM_REF_ENTITY_TYPES = [
    'LEAD',
    'CONTACT',
    'COMPANY',
    'DEAL',
] as const;

export type CrmRefEntityType = (typeof CRM_REF_ENTITY_TYPES)[number];

/** Префикс значения по типу сущности: `D_123`, `L_42` и т.д. */
export const CRM_REF_PREFIX: Record<CrmRefEntityType, string> = {
    LEAD: 'L',
    CONTACT: 'C',
    COMPANY: 'CO',
    DEAL: 'D',
};

/**
 * Значение для crm-поля Битрикса по ПРАВИЛУ САМОГО БИТРИКСА:
 *
 *  - в поле разрешён ОДИН тип сущности (SETTINGS: DEAL='Y', остальные 'N') —
 *    хранится голый идентификатор: `1024`. Значение `D_1024` такое поле
 *    молча отбрасывает, и оно остаётся пустым;
 *  - разрешено НЕСКОЛЬКО типов — идентификатор с префиксом: `D_1024`,
 *    иначе Битрикс не знает, к какой сущности относится число.
 *
 * `allowedTypes` — фактические привязки поля с портала (не наша константа):
 * поле могли установить с любым набором, и правило обязано следовать факту.
 * Список пуст (поле не прочитано) — берём безопасный вариант с префиксом:
 * так ведёт себя поле «по умолчанию», где инсталлер включает все четыре типа.
 *
 * `ref` может быть как id, так и `$result[cmd]`-ссылкой того же батча —
 * подстановка Битрикса работает и внутри строки с префиксом.
 */
export const buildCrmRefValue = (
    allowedTypes: readonly CrmRefEntityType[],
    entityType: CrmRefEntityType,
    ref: string | number,
): string => {
    const value = String(ref);
    return allowedTypes.length === 1
        ? value
        : `${CRM_REF_PREFIX[entityType]}_${value}`;
};

/** Разбор значения crm-поля в id: понимает и `123`, и `D_123`. */
export const parseCrmRefId = (raw: unknown): number | null => {
    if (typeof raw !== 'string' && typeof raw !== 'number') return null;
    const match = /^(?:[A-Z]{1,2}_)?(\d+)$/.exec(String(raw).trim());
    return match ? Number(match[1]) : null;
};
