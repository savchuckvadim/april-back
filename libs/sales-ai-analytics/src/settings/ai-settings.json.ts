/**
 * Разбор JSON-строк настроек портала: общие предохранители парсеров
 * (план Фазы 2, §3.3 — «битый JSON любого ключа → дефолт без исключения»).
 *
 * Настройка приходит из БД и правится руками в админке, поэтому ни один
 * помощник не бросает исключений: непонятное значение отбрасывается, а
 * вызывающий парсер подставляет дефолт кода. Чистые функции: без DI,
 * Bitrix и Prisma.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Значение — дата YYYY-MM-DD (без проверки календарной корректности). */
export function isIsoDate(value: unknown): value is string {
    return typeof value === 'string' && ISO_DATE_RE.test(value);
}

/** JSON-объект или массив из строки настройки; иначе undefined. */
export function parseJsonValue(json: string | null | undefined): unknown {
    if (typeof json !== 'string' || json.trim() === '') {
        return undefined;
    }
    try {
        return JSON.parse(json) as unknown;
    } catch {
        return undefined;
    }
}

/** Запись «ключ → значение» либо undefined (массив записью не считается). */
export function asRecord(
    value: unknown,
): Readonly<Record<string, unknown>> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Readonly<Record<string, unknown>>)
        : undefined;
}

/** Массив либо пустой массив. */
export function asArray(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [];
}

/** Непустая строка либо undefined. */
export function asText(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() !== ''
        ? value.trim()
        : undefined;
}

/** Конечное число либо undefined. */
export function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
        ? value
        : undefined;
}

/** Целое положительное число (id менеджера) либо undefined. */
export function asPositiveInt(value: unknown): number | undefined {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined;
}

/** Флаг либо undefined. */
export function asFlag(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

/** Значение из справочника либо undefined. */
export function asOneOf<T extends string>(
    value: unknown,
    allowed: readonly T[],
): T | undefined {
    return typeof value === 'string' &&
        (allowed as readonly string[]).includes(value)
        ? (value as T)
        : undefined;
}

/** Подмножество справочника без дублей; пустой результат → undefined. */
export function asSubsetOf<T extends string>(
    value: unknown,
    allowed: readonly T[],
): T[] | undefined {
    const items = asArray(value).flatMap(item => {
        const one = asOneOf(item, allowed);
        return one ? [one] : [];
    });
    const unique = [...new Set(items)];
    return unique.length > 0 ? unique : undefined;
}

/** Число в границах [min; max] либо undefined (значение вне — не решение). */
export function asNumberIn(
    value: unknown,
    range: readonly [number, number],
): number | undefined {
    const numeric = asNumber(value);
    return numeric !== undefined && numeric >= range[0] && numeric <= range[1]
        ? numeric
        : undefined;
}

/** Дата YYYY-MM-DD либо undefined. */
export function asIsoDate(value: unknown): string | undefined {
    return isIsoDate(value) ? value : undefined;
}
