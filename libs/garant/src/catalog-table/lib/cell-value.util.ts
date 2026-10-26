import * as ExcelJS from 'exceljs';

/**
 * Приведение значений ячеек ExcelJS к примитивам. Значение может быть
 * строкой, числом, датой, формулой, гиперссылкой или rich text —
 * простой String() недопустим.
 */

export const cellToString = (value: ExcelJS.CellValue): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
        if ('richText' in value && Array.isArray(value.richText)) {
            return value.richText
                .map(part => part.text)
                .join('')
                .trim();
        }
        if ('result' in value) {
            return cellToString(value.result as ExcelJS.CellValue);
        }
        if ('text' in value && typeof value.text === 'string') {
            return value.text.trim();
        }
    }
    return '';
};

/** Строка или null, если ячейка пуста */
export const cellToNullableString = (
    value: ExcelJS.CellValue,
): string | null => {
    const str = cellToString(value);
    return str === '' ? null : str;
};

/**
 * Денежное/числовое значение ячейки: терпит «8 187,00 р.», «1 800₽»,
 * неразрывные пробелы и запятую как разделитель дробной части.
 * Пустая ячейка и нечисловой мусор — null (строка пойдёт в skipped,
 * а не превратится в цену 0).
 */
export const cellToNumber = (value: ExcelJS.CellValue): number | null => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    const raw = cellToString(value);
    if (raw === '') return null;
    const cleaned = raw
        // \s покрывает обычный пробел, неразрывный и узкий неразрывный
        .replace(/\s/g, '')
        .replace(/руб\.?|р\.|₽/gi, '')
        .replace(',', '.');
    if (cleaned === '') return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
};

/** Булево значение ячейки: 1/true/да/yes/+ → true */
export const cellToBoolean = (value: ExcelJS.CellValue): boolean => {
    if (typeof value === 'boolean') return value;
    const raw = cellToString(value).toLowerCase();
    return ['1', 'true', 'да', 'yes', 'y', '+', 'истина'].includes(raw);
};
