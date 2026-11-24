/**
 * Сбой на записи в Битрикс. Отличается от остальных ошибок потока тем, что
 * часть команд могла успеть выполниться: такое событие нельзя запускать
 * повторно автоматически — счётчики документов считаются как «прочитал + 1»
 * и удвоились бы.
 */
export class EventDocumentWriteError extends Error {
    constructor(readonly reason: unknown) {
        super(
            `Поток документов: запись в Битрикс не завершена — ${
                reason instanceof Error ? reason.message : String(reason)
            }`,
        );
        this.name = 'EventDocumentWriteError';
    }
}
