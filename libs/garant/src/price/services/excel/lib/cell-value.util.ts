import * as ExcelJS from 'exceljs';

/**
 * Безопасно приводит значение ячейки ExcelJS к строке.
 *
 * `CellValue` — это union (число, строка, boolean, дата, формула, rich-text,
 * гиперссылка, ошибка), поэтому прямой `String()`/`.toString()` по объектным
 * вариантам может дать `[object Object]`. Хелпер разбирает объектные варианты
 * и возвращает осмысленный текст (пустую строку — для null/undefined).
 */
export function cellValueToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    // Объектные варианты CellValue.
    if ('richText' in value && Array.isArray(value.richText)) {
        return value.richText.map(part => part.text).join('');
    }
    if ('text' in value && typeof value.text === 'string') {
        return value.text; // гиперссылка
    }
    if ('result' in value) {
        return cellValueToString(value.result ?? null); // формула
    }
    if ('error' in value) {
        return value.error;
    }
    return '';
}
