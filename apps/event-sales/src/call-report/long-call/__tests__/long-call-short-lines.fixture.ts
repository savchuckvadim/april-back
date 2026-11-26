import {
    renderTranscriptWithTimecodes,
    type TranscriptSegment,
    type TranscriptSpeaker,
} from '@lib/call-lib';

/**
 * Расшифровка «как у Яндекса»: сегмент распознавания — два слова, шаг
 * полсекунды, говорящие чередуются блоками. Строки печатает настоящая
 * renderTranscriptWithTimecodes, поэтому формат — тот же, что у модели.
 */

/** Сегментов подряд у одного говорящего. */
export const SPEAKER_BLOCK_SEGMENTS = 40;
const SEGMENT_SEC = 0.5;
const BLOCK_SPEAKERS: readonly TranscriptSpeaker[] = ['manager', 'client'];

/** Сегменты: слово с номером (все слова разные) и «дальше». */
export function shortSegments(count: number): TranscriptSegment[] {
    return Array.from({ length: count }, (_, index) => ({
        startSec: index * SEGMENT_SEC,
        endSec: (index + 1) * SEGMENT_SEC,
        speaker:
            BLOCK_SPEAKERS[
                Math.floor(index / SPEAKER_BLOCK_SEGMENTS) %
                    BLOCK_SPEAKERS.length
            ],
        text: `слово${index} дальше`,
    }));
}

/** Расшифровка для модели из count коротких сегментов. */
export const shortLinesTranscript = (count: number): string =>
    renderTranscriptWithTimecodes(shortSegments(count));

/** Начало строки расшифровки: метка и подпись говорящего. */
const LINE_HEAD = /^\s*\[\d+:\d{2}\]\s*(?:(?:Менеджер|Клиент):)?\s*/;
const LINE_BREAK = /\r?\n/;
const WHITESPACE = /\s+/;

/** Текст строки без метки и подписи говорящего. */
export const textOf = (line: string): string => line.replace(LINE_HEAD, '');

/** Строки расшифровки. */
export const linesOf = (text: string): string[] => text.split(LINE_BREAK);

/** Слова расшифровки по порядку, без меток и подписей. */
export const wordsOf = (text: string): string[] =>
    linesOf(text)
        .flatMap(line => textOf(line).split(WHITESPACE))
        .filter(word => word.length > 0);
