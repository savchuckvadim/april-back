/**
 * Общие мелочи разбора ответов модели по длинному разговору: проверка
 * формы значения и обрезка строк. Один набор для конспекта части и сводки.
 */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

/** Значение — одна из строк списка (сужает тип до элемента списка). */
export function isOneOf<T extends string>(
    list: readonly T[],
    value: unknown,
): value is T {
    return (
        typeof value === 'string' && (list as readonly string[]).includes(value)
    );
}

/** Строка без крайних пробелов, не длиннее предела; не строка — пустая. */
export function clipText(value: unknown, maxChars: number): string {
    if (typeof value !== 'string') return '';

    return value.trim().slice(0, maxChars).trimEnd();
}
