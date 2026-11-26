import type { TranscriptLine } from './long-call.types';

/**
 * Метки времени расшифровки для модели: `[мм:сс] текст` или
 * `[мм:сс] Менеджер: текст` (см. renderTranscriptWithTimecodes в call-lib).
 * Минуты могут быть больше 59 и трёхзначными: `[125:03]`.
 */

const SECONDS_IN_MINUTE = 60;
const LINE_BREAK = /\r?\n/;
/** Метка `[мм:сс]` в начале строки (пробелы перед ней допустимы). */
const TIMECODE_AT_START = /^\s*\[(\d+):(\d{2})\]/;

/**
 * Секунды метки `[мм:сс]` в начале строки; метки нет или секунды не меньше
 * 60 — null.
 */
export function parseTimecodeSec(line: string): number | null {
    const match = TIMECODE_AT_START.exec(line);
    if (!match) return null;
    const seconds = Number(match[2]);
    if (seconds >= SECONDS_IN_MINUTE) return null;

    return Number(match[1]) * SECONDS_IN_MINUTE + seconds;
}

/**
 * Строки расшифровки по порядку с секундами каждой (null у строки без
 * метки). Пустые строки отбрасываются; у старой записи без переводов строк
 * это одна строка без метки.
 */
export function transcriptLines(text: string): TranscriptLine[] {
    return text
        .split(LINE_BREAK)
        .filter(line => line.trim().length > 0)
        .map(line => ({ text: line, sec: parseTimecodeSec(line) }));
}
