/**
 * Контракт распознавания длинного звонка кусками (резка длинных звонков,
 * 19.11.2026). Кто распознаёт куски и в каком порядке, решает
 * маршрутизатор: он передаёт упорядоченный список распознавателей —
 * бесплатные первыми, Яндекс последним запасным.
 */
import type { TranscriptSegment } from '../types/transcript-segment.types';

/** Ответ распознавателя на кусок; segments null — таймкодов он не дал. */
export interface ChunkRecognition {
    text: string;
    /** Время — от начала куска. */
    segments: TranscriptSegment[] | null;
}

/** Какой кусок распознаётся: для журнала и длительности шага маршрута. */
export interface ChunkInfo {
    /** Номер куска с нуля. */
    index: number;
    count: number;
    /** Границы куска в записи, секунд. */
    startSec: number;
    endSec: number;
}

/** Один распознаватель куска; порядок в списке — порядок попыток. */
export interface ChunkAttempt {
    /** Имя для журнала и итога: «VibeCode», «свой Whisper», «Yandex». */
    provider: string;
    transcribe(
        chunk: Buffer,
        fileName: string,
        info: ChunkInfo,
    ): Promise<ChunkRecognition>;
}

export interface TranscribeChunkedInput {
    /**
     * Ключ звонка для прогресса в Redis: повторный запуск с тем же ключом
     * берёт готовые куски и распознаёт только оставшиеся.
     */
    callKey: string;
    audio: Buffer;
    fileName: string;
    /** Длина куска без нахлёста, секунд. */
    chunkSec: number;
    /** Нахлёст соседних кусков, секунд. */
    overlapSec: number;
    /** Сколько кусков распознаются одновременно. */
    parallel: number;
    attempts: readonly ChunkAttempt[];
}

export interface ChunkedTranscriptionResult {
    text: string;
    /** Сегменты всей записи; null — ни один кусок не дал таймкодов. */
    segments: TranscriptSegment[] | null;
    /** Сколько кусков. */
    chunks: number;
    /** Сколько кусков распознал каждый распознаватель. */
    providers: Record<string, number>;
    /** Секунды записи (с нахлёстом), распознанные каждым, — для счёта расхода. */
    providerSeconds: Record<string, number>;
    /** Хотя бы один кусок без таймкодов. */
    untimed: boolean;
}
