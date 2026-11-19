/** Фаза обращения к Яндексу — для текста ошибки и логов. */
export type YandexSttPhase = 'submit' | 'poll';

/**
 * Ошибка HTTP Яндекса: код, requestId (по нему поддержка Яндекса находит
 * инцидент) и фаза. По `transient` роутер решает, переключаться ли на
 * запасной провайдер: 5xx и 429 — временное, 4xx (нет прав, плохой запрос)
 * повторять бессмысленно. `status === null` — сетевая ошибка (обрыв,
 * «fetch failed») — тоже временная.
 *
 * Появилась после ночи 28.10.2026: Яндекс отдавал 500 на опросе операций,
 * а первый же не-200 ответ ронял 35-минутное ожидание целиком.
 */
export class YandexSttHttpError extends Error {
    readonly name = 'YandexSttHttpError';

    constructor(
        readonly status: number | null,
        readonly requestId: string | null,
        readonly phase: YandexSttPhase,
        message: string,
    ) {
        super(message);
    }

    get transient(): boolean {
        return (
            this.status === null || this.status >= 500 || this.status === 429
        );
    }
}

/** Операция распознавания завершилась ошибкой на стороне Яндекса (поле error). */
export class YandexOperationFailedError extends Error {
    readonly name = 'YandexOperationFailedError';
}

/**
 * Яндекс не завершил операцию за отведённые опросы. Операция при этом
 * жива и оплачена: номер сохранён стражем отправок, следующий запуск
 * продолжит её ждать, а не отправит звонок заново.
 */
export class YandexOperationPendingError extends Error {
    readonly name = 'YandexOperationPendingError';
}

const NETWORK_ERROR_RE =
    /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|UND_ERR/i;

/** Временная ли ошибка пути Яндекса (HTTP 5xx/429 или сеть) — повтор и запасной путь уместны. */
export const isTransientYandexError = (error: unknown): boolean => {
    if (error instanceof YandexSttHttpError) return error.transient;
    return error instanceof Error && NETWORK_ERROR_RE.test(error.message);
};

/** Яндекс не знает такую операцию (404 на опросе): истекла (3 суток) или чужая. */
export const isYandexOperationNotFound = (error: unknown): boolean =>
    error instanceof YandexSttHttpError &&
    error.phase === 'poll' &&
    error.status === 404;

/**
 * Операция, возможно, ещё идёт: опрос прерван таймаутом или серией
 * временных сбоев. Запись в Object Storage ей ещё может понадобиться.
 */
export const isYandexOperationAlive = (error: unknown): boolean =>
    error instanceof YandexOperationPendingError ||
    (error instanceof YandexSttHttpError &&
        error.phase === 'poll' &&
        error.transient);
