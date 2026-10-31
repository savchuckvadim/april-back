/** Склеить непустые части: «ИНН …, КПП …». */
export const joinNonEmpty = (
    parts: Array<string | null | undefined>,
    separator = ', ',
): string =>
    parts
        .map(part => part?.trim() ?? '')
        .filter(part => part.length > 0)
        .join(separator);

/**
 * Число из строки документа: «12 345,50», «15 %», «1 200.00 руб.».
 * Нечисло — 0, чтобы условия вида «есть ли скидка» не ломались.
 */
export const parseAmount = (value: string | null | undefined): number => {
    if (!value) return 0;
    const normalized = value
        .replace(/\s/g, '')
        .replace(',', '.')
        .replace(/[^\d.-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

/** Разбить список на строки по N элементов (двухколоночная таблица). */
export const chunk = <T>(items: readonly T[], size: number): T[][] => {
    const rows: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        rows.push(items.slice(index, index + size));
    }
    return rows;
};
