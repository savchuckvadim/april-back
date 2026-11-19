/**
 * Кусок длинного звонка не распознал ни один распознаватель (включая
 * Яндекс): звонок целиком считается нераспознанным. Готовые куски
 * остались в Redis — повторный запуск распознает только оставшиеся.
 */
export class ChunkTranscriptionError extends Error {
    constructor(
        readonly callKey: string,
        /** Номер куска с нуля. */
        readonly chunkIndex: number,
        readonly chunkCount: number,
        /** «распознаватель: ошибка» по каждой попытке. */
        readonly attemptErrors: readonly string[],
        startSec: number,
        endSec: number,
    ) {
        super(
            `Звонок ${callKey}: кусок ${chunkIndex + 1} из ${chunkCount} ` +
                `(${Math.round(startSec)}–${Math.round(endSec)} с) не распознал никто — ` +
                attemptErrors.join('; '),
        );
        this.name = 'ChunkTranscriptionError';
    }
}
