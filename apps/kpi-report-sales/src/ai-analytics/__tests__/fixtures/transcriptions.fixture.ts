import type { TranscriptionStoreService } from '@lib/call-lib';

/**
 * Мок хранилища транскрипций для settings/get: момент самого раннего
 * готового разбора портала (`findFirstDoneAt`), null — разборов нет,
 * Error — чтение падает.
 */
export function transcriptionsWith(
    first: Date | null | Error = null,
): TranscriptionStoreService & { findFirstDoneAt: jest.Mock } {
    const findFirstDoneAt = jest.fn(
        (): Promise<Date | null> =>
            first instanceof Error
                ? Promise.reject(first)
                : Promise.resolve(first),
    );
    return { findFirstDoneAt } as never;
}
