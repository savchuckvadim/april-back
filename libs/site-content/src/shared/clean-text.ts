/**
 * Текст из формы админки: пробелы по краям срезаются, пустая строка —
 * «нет текста» (null). undefined — поле не передано, его не трогаем.
 */
export const cleanText = (
    value: string | null | undefined,
): string | null | undefined =>
    value === undefined ? undefined : value?.trim() || null;

/** То же, но «не передано» — тоже null: для новых строк. */
export const cleanTextOrNull = (
    value: string | null | undefined,
): string | null => cleanText(value) ?? null;
