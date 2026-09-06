/**
 * Безопасное чтение значений из ais.user_result (произвольный JSON от
 * LLM/агента): никаких исключений и приведения типов — не подошло по
 * типу, значит значения нет. Используются агрегаторами и выборкой
 * отчётов вместо дублирования приватных хелперов в каждом сервисе.
 */

export function asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

export function asString(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

export function asStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter(
              (item): item is string => typeof item === 'string' && item !== '',
          )
        : [];
}

/** Объект (не массив) или null — для вложенных структур user_result. */
export function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

/** Массив объектов (элементы не-объекты отбрасываются); не массив → []. */
export function asRecordArray(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
        ? value
              .map(asRecord)
              .filter((item): item is Record<string, unknown> => item !== null)
        : [];
}

/**
 * Объект «ключ → непустая строка» (значения других типов отбрасываются);
 * не объект → null. Для versions разбора.
 */
export function asStringRecord(value: unknown): Record<string, string> | null {
    const record = asRecord(value);
    if (!record) return null;
    const result: Record<string, string> = {};
    for (const [key, item] of Object.entries(record)) {
        const text = asString(item);
        if (text !== null) result[key] = text;
    }
    return result;
}
