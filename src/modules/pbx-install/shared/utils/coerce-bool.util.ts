/**
 * Приводит «булевоподобное» значение из Excel-ячейки к boolean.
 *
 * ExcelJS в зависимости от того, как заполнена ячейка, возвращает разные типы:
 * - настоящий `boolean` (если в ячейке TRUE/FALSE);
 * - строку `'true' | 'false'` в любом регистре (если значение введено текстом);
 * - число `1 | 0`;
 * - `null | undefined` для пустой ячейки;
 * - формульную ячейку `{ result }` — её разворачивает {@link unwrapExcelCellValue} ДО вызова этого хелпера.
 *
 * Любое нераспознанное значение трактуется как `defaultValue` (по умолчанию `false`).
 */
export function coerceExcelBool(value: unknown, defaultValue = false): boolean {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
        return defaultValue;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'да'].includes(normalized)) {
            return true;
        }
        if (['false', '0', 'no', 'n', 'нет', ''].includes(normalized)) {
            return false;
        }
        return defaultValue;
    }
    return defaultValue;
}
