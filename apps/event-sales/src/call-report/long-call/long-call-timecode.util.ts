import type { TranscriptLine } from './long-call.types';

/**
 * Метки времени расшифровки для модели: `[мм:сс] текст` или
 * `[мм:сс] Менеджер: текст` (см. renderTranscriptWithTimecodes в call-lib).
 * Минуты могут быть больше 59 и трёхзначными: `[125:03]`.
 */

const SECONDS_IN_MINUTE = 60;
const LINE_BREAK = /\r?\n/;
/** Метка `[мм:сс]` в начале строки (пробелы перед ней допустимы) и остаток строки. */
const TIMECODE_AT_START = /^\s*(\[(\d+):(\d{2})\])([\s\S]*)$/;

/** Строка с меткой времени, разобранная на метку и остаток. */
export interface TimecodedLine {
    /** Метка как она написана в строке: `[12:05]`. */
    label: string;
    /** Секунды метки. */
    sec: number;
    /** Всё после метки как есть (обычно с пробелом в начале). */
    rest: string;
}

/**
 * Строка, разобранная на метку `[мм:сс]` и остаток; метки нет или секунды не
 * меньше 60 — null.
 */
export function splitTimecode(line: string): TimecodedLine | null {
    const match = TIMECODE_AT_START.exec(line);
    if (!match) return null;
    const seconds = Number(match[3]);
    if (seconds >= SECONDS_IN_MINUTE) return null;

    return {
        label: match[1],
        sec: Number(match[2]) * SECONDS_IN_MINUTE + seconds,
        rest: match[4],
    };
}

/**
 * Секунды метки `[мм:сс]` в начале строки; метки нет или секунды не меньше
 * 60 — null.
 */
export function parseTimecodeSec(line: string): number | null {
    return splitTimecode(line)?.sec ?? null;
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
