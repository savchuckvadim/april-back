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
