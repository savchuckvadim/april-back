import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Пачка дошла до Битрикса: в ответе есть `result`.
 *
 * Не дошедшая пачка (таймаут, обрыв сети, отказ очереди запросов) приходит
 * из `callBatchAsync` объектом ошибки — без `result`. Это НЕ то же самое,
 * что ошибки отдельных команд (`result_error`): те бывают ожидаемыми —
 * например, «элемент уже существует» при повторном создании элемента со
 * своим кодом — и падением не считаются.
 */
export const isDeliveredBatchChunk = (chunk: unknown): boolean =>
    !!chunk && typeof chunk === 'object' && 'result' in chunk;

/**
 * Пачки не дошли до Битрикса — данные неполные. Выдавать их за «ничего не
 * найдено» нельзя: менеджер увидел бы «пересечений нет» там, где они есть,
 * а результат ещё и лёг бы в кэш. Ответ — 503 с понятным текстом: «не
 * удалось, повторите».
 */
export class BitrixBatchUndeliveredError extends ServiceUnavailableException {
    constructor(
        readonly what: string,
        readonly failed: number,
        readonly total: number,
    ) {
        super(
            `${what}: Битрикс сейчас не ответил — данные не получены, ` +
                'повторите через минуту',
        );
        this.name = 'BitrixBatchUndeliveredError';
    }
}

/** Бросить, если хоть одна пачка не дошла. */
export const assertBatchDelivered = (
    chunks: readonly unknown[],
    what: string,
): void => {
    const failed = chunks.filter(chunk => !isDeliveredBatchChunk(chunk)).length;
    if (failed)
        throw new BitrixBatchUndeliveredError(what, failed, chunks.length);
};
