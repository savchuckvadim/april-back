/** Строка ответа ClickHouse (JSONEachRow) до приведения типов. */
export type LogRawRow = Record<string, unknown>;

/** Числа ClickHouse (UInt64) приходят строками — приводим один раз здесь. */
export const num = (value: unknown): number => Number(value) || 0;

/** Строковое поле ответа; всё прочее — пустая строка. */
export const str = (value: unknown): string =>
    typeof value === 'string'
        ? value
        : typeof value === 'number'
          ? String(value)
          : '';
