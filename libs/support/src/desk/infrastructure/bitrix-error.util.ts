/**
 * Код ошибки Битрикса из исключения ядра: оно бросает ошибку axios, тело
 * ответа — `{ error, error_description }`. null — не ответ Битрикса
 * (сеть, таймаут, наш код).
 */
export function bitrixErrorCode(error: unknown): string | null {
    const data = (error as { response?: { data?: unknown } } | null)?.response
        ?.data;
    if (!data || typeof data !== 'object') return null;
    const code = (data as { error?: unknown }).error;
    return typeof code === 'string' && code ? code : null;
}

/** Отказ в доступе к чату или действию: ключ не участник диалога. */
const ACCESS_CODES = new Set(['ACCESS_ERROR', 'ACCESS_DENIED']);

export function isBitrixAccessError(error: unknown): boolean {
    const code = bitrixErrorCode(error);
    return code !== null && ACCESS_CODES.has(code);
}
