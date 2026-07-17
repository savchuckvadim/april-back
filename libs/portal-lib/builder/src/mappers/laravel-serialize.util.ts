/**
 * Утилиты сериализации значений БД в форму, которую исторически отдавал
 * Laravel (числа вместо BigInt, ISO-строки вместо Date).
 */

/** BigInt/Number -> number (Laravel отдавал целые числа). */
export const toNumber = (value: bigint | number): number => Number(value);

/** Nullable BigInt/строка с числом -> number | null. */
export const toNumberOrNull = (
    value: bigint | number | string | null,
): number | null => (value === null ? null : Number(value));

/** Date -> ISO-строка (Laravel сериализовал timestamps строками). */
export const toIsoOrNull = (value: Date | null): string | null =>
    value ? value.toISOString() : null;

/**
 * Колонка в БД nullable, а интерфейсы Portal исторически объявляют поле
 * non-null (так описан ответ Laravel). Значение сохраняем как есть ради
 * паритета данных — null проходит насквозь, тип сужаем осознанно.
 */
export const nonNull = <T>(value: T | null): T => value as T;
