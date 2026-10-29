import type { AxiosError } from 'axios';
import {
    BITRIX_ACCESS_DENIED_TEXT,
    BITRIX_NOT_FOUND_TEXT,
} from './bitrix-benign-error.util';

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
 * Тексты ошибки Битрикса: тело ответа и сообщение. Ядро бросает ошибку
 * axios, и описание лежит в ТЕЛЕ (`{ error, error_description }`), а не в
 * `error.message` — там только «Request failed with status code 4xx».
 * Сообщение тоже смотрим: обёртки выше по стеку кладут текст туда.
 */
const errorTexts = (error: unknown): string[] => {
    const e = error as { message?: unknown; response?: { data?: unknown } };
    const body = e?.response?.data;
    const bodyText =
        typeof body === 'string'
            ? body
            : body && typeof body === 'object'
              ? JSON.stringify(body)
              : '';
    const message = typeof e?.message === 'string' ? e.message : '';
    return [bodyText, message];
};

/** Битрикс отказал в правах. */
export const isBitrixAccessDenied = (error: unknown): boolean =>
    errorTexts(error).some(text => BITRIX_ACCESS_DENIED_TEXT.test(text));

/** Битрикс не нашёл сущность (`crm.deal.get` удалённой сделки). */
export const isBitrixNotFound = (error: unknown): boolean =>
    errorTexts(error).some(text => BITRIX_NOT_FOUND_TEXT.test(text));

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
