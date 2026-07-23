/**
 * Парсинг env-значений с дефолтами — вместо копипасты
 * `Number.parseInt(...) + Number.isFinite(...)` по сервисам.
 * Принимают уже прочитанное значение (из ConfigService или process.env),
 * чтобы утилиты не зависели от способа чтения конфига.
 */

/** Целое из env: NaN/пусто/вне [min..max] → default. */
export function envInt(
    raw: string | undefined,
    defaultValue: number,
    options?: { min?: number; max?: number },
): number {
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (!Number.isFinite(parsed)) return defaultValue;
    if (options?.min !== undefined && parsed < options.min) return defaultValue;
    if (options?.max !== undefined && parsed > options.max) return defaultValue;
    return parsed;
}

/** Дробное из env: NaN/пусто/вне [min..max] → default. */
export function envFloat(
    raw: string | undefined,
    defaultValue: number,
    options?: { min?: number; max?: number },
): number {
    const parsed = raw ? Number.parseFloat(raw) : NaN;
    if (!Number.isFinite(parsed)) return defaultValue;
    if (options?.min !== undefined && parsed < options.min) return defaultValue;
    if (options?.max !== undefined && parsed > options.max) return defaultValue;
    return parsed;
}

/**
 * Флаг «включено по умолчанию, выключается '0'» — конвенция kill-switch'ей
 * конвейера (CALL_REPORT_COMBINED_ANALYSIS и т.п.).
 */
export function envEnabledByDefault(raw: string | undefined): boolean {
    return raw !== '0';
}
