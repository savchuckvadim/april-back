/**
 * Строка из базы → значение перечня `as const`. В таблицах перечни хранятся
 * строками (реестр значений — в коде), поэтому значение проверяется при
 * чтении, а не приводится вслепую.
 */
export const isOneOf = <T extends string>(
    values: readonly T[],
    value: unknown,
): value is T =>
    typeof value === 'string' && (values as readonly string[]).includes(value);

/** Значение перечня или null, если в базе лежит неизвестное значение. */
export const oneOfOrNull = <T extends string>(
    values: readonly T[],
    value: unknown,
): T | null => (isOneOf(values, value) ? value : null);
