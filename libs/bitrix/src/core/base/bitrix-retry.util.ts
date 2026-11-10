import { AxiosError } from 'axios';
import {
    isBitrixConnectionReset,
    isBitrixQueryLimitExceeded,
    isBitrixTimeout,
} from './bitrix-response.util';

/**
 * HTTP-статусы, которые облако Битрикса отдаёт при собственной перегрузке и
 * которые проходят повтором через несколько секунд.
 *
 * 500 «INTERNAL_SERVER_ERROR» Битрикс отдаёт всплесками по 1–2 минуты на
 * любые методы, включая `user.get` (garantservisvoronezh 06, 08 и 09.11.2026);
 * без повтора один такой ответ ронял обработку окна холодного обзвона на
 * 85 сделок целиком.
 */
export const TRANSIENT_BITRIX_STATUSES: ReadonlySet<number> = new Set([
    500, 502, 503, 504,
]);

/** Почему сбой стоит повторить. */
export const BITRIX_RETRY_KIND = {
    timeout: 'timeout',
    connectionReset: 'connection-reset',
    queryLimit: 'query-limit',
    transient: 'transient',
} as const;

export type BitrixRetryKind =
    (typeof BITRIX_RETRY_KIND)[keyof typeof BITRIX_RETRY_KIND];

/** Вид повторяемого сбоя; null — сбой не из тех, что лечатся повтором. */
export function bitrixRetryKind(error: unknown): BitrixRetryKind | null {
    if (isBitrixTimeout(error)) return BITRIX_RETRY_KIND.timeout;
    if (isBitrixConnectionReset(error)) {
        return BITRIX_RETRY_KIND.connectionReset;
    }
    if (isBitrixQueryLimitExceeded(error)) return BITRIX_RETRY_KIND.queryLimit;
    const status = (error as AxiosError | null)?.response?.status;
    if (status && TRANSIENT_BITRIX_STATUSES.has(status)) {
        return BITRIX_RETRY_KIND.transient;
    }
    return null;
}

/** Попытка обращения в Битрикс — для текста тревоги. */
export interface BitrixAttempt {
    /** Номер попытки, с 1. */
    attempt: number;
    /** Всего попыток: первая и повторы. */
    total: number;
    /** Пауза перед следующей попыткой; null — следующей не будет. */
    retryInMs: number | null;
    /** Сбой из повторяемых (5xx, таймаут, обрыв, лимит запросов). */
    retryable: boolean;
}

/**
 * Пометка в начале тревоги (решение владельца 10.11.2026): тревога уходит
 * на КАЖДУЮ неудачную попытку, но по тексту сразу видно, повторим ли мы
 * запрос или попытки кончились и запрос так и не выполнен. Раньше 500 с
 * успешным повтором и 500, после которого данные потеряны, выглядели
 * одинаково. Не повторяемая ошибка (400 и т. п.) — без пометки.
 */
export function attemptAlertNote(attempt: BitrixAttempt): string {
    if (attempt.retryInMs !== null) {
        return (
            `Попытка ${attempt.attempt} из ${attempt.total}, ` +
            `повтор через ${attempt.retryInMs / 1000} с. `
        );
    }
    if (attempt.retryable) {
        return (
            `⚠️ ПОПЫТКИ ИСЧЕРПАНЫ (${attempt.attempt} из ${attempt.total}) — ` +
            'запрос не выполнен. '
        );
    }
    return '';
}
