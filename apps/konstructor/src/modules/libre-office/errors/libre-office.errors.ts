/**
 * Ошибки конвертации разделены, потому что вызывающий реагирует на них
 * по-разному: Busy/Timeout — «попробуй позже», Convert — «документ не такой».
 */

/** Все слоты заняты и очередь ожидания переполнена — конвертация даже не начиналась. */
export class LibreOfficeBusyError extends Error {
    constructor(pending: number, maxQueue: number) {
        super(
            `Сервис конвертации перегружен: в очереди ${pending} из ${maxQueue}. Попробуйте позже.`,
        );
        this.name = 'LibreOfficeBusyError';
    }
}

/** Конвертация началась, но не уложилась в таймаут — обычно слишком тяжёлый документ. */
export class LibreOfficeTimeoutError extends Error {
    constructor(
        readonly timeoutMs: number,
        readonly baseUrl: string,
    ) {
        super(
            `Конвертация не завершилась за ${timeoutMs} мс (${baseUrl}). Документ слишком тяжёлый.`,
        );
        this.name = 'LibreOfficeTimeoutError';
    }
}

/** Сервис конвертации ответил ошибкой либо не отдал PDF. */
export class LibreOfficeConvertError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = 'LibreOfficeConvertError';
    }
}

/** Операцию отменил клиент — конвертация прервана, слот освобождён сразу. */
export class LibreOfficeCancelledError extends Error {
    constructor() {
        super('Операция отменена клиентом');
        this.name = 'LibreOfficeCancelledError';
    }
}

/** Причина для метрик — по ней видно, что именно деградировало. */
export type LibreOfficeErrorReason =
    | 'busy'
    | 'timeout'
    | 'cancelled'
    | 'http'
    | 'network';

export function libreOfficeErrorReason(error: unknown): LibreOfficeErrorReason {
    if (error instanceof LibreOfficeBusyError) return 'busy';
    if (error instanceof LibreOfficeTimeoutError) return 'timeout';
    if (error instanceof LibreOfficeCancelledError) return 'cancelled';
    if (error instanceof LibreOfficeConvertError) return 'http';
    return 'network';
}

/**
 * Транзиентные коды: перегруз или временная недоступность инстанса.
 * 503 — то, чем Gotenberg отвечает при превышении своего --api-timeout,
 * когда запрос простоял в очереди LibreOffice.
 */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
    408, 425, 429, 500, 502, 503, 504,
]);

export function isRetryableStatus(status: number): boolean {
    return RETRYABLE_STATUSES.has(status);
}
