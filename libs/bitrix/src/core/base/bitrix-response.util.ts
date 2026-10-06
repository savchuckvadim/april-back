import type { AxiosError } from 'axios';

/**
 * Разбор ответов и ошибок Битрикса — чистые функции ядра (BitrixCore).
 */

/** Код ошибки Битрикса «превышен лимит запросов» (HTTP 503). */
const QUERY_LIMIT_EXCEEDED = 'QUERY_LIMIT_EXCEEDED';

/** Коды axios/сети: попытка не уложилась в отведённое время. */
const TIMEOUT_CODES: ReadonlySet<string> = new Set([
    'ECONNABORTED',
    'ETIMEDOUT',
]);

/** Попытка не уложилась в таймаут (наш или сетевой). */
export const isBitrixTimeout = (error: unknown): boolean => {
    const e = error as { message?: string; code?: string };
    return (
        (typeof e?.code === 'string' && TIMEOUT_CODES.has(e.code)) ||
        (typeof e?.message === 'string' && e.message.includes('timeout'))
    );
};

/** Битрикс ответил «превышен лимит запросов» — строкой или JSON-ом. */
export const isBitrixQueryLimitExceeded = (error: unknown): boolean => {
    const body = (error as AxiosError).response?.data;
    if (typeof body === 'string') return body.includes(QUERY_LIMIT_EXCEEDED);
    return (
        typeof body === 'object' &&
        body !== null &&
        (body as { error?: unknown }).error === QUERY_LIMIT_EXCEEDED
    );
};

/**
 * Поле `time` ответа Битрикса в секундах: `processing` — сколько он работал
 * над этим запросом, `operating` — сколько метод отработал в окне лимита.
 * Нет поля, не число, ноль — null.
 */
export const readBitrixTime = (
    body: unknown,
    field: 'processing' | 'operating',
): number | null => {
    if (typeof body !== 'object' || body === null) return null;
    const time = (body as { time?: unknown }).time;
    if (typeof time !== 'object' || time === null) return null;
    const value = Number((time as Record<string, unknown>)[field]);
    return Number.isFinite(value) && value > 0
        ? Number(value.toFixed(2))
        : null;
};
