import type { TimedWord } from '../lib/segments.mapper';
import type { IYAChanks } from '../services/streaming-transcription.service';

/**
 * Слова и куски ответа Яндекса (longRunningRecognize) для стерео-спек:
 * фраза раскладывается по времени с равным шагом, канал копируется
 * со сдвигом — так собираются «двойное моно», эхо и раздельное стерео.
 */

/** Шаг между началами слов фразы и длительность слова, секунды. */
const WORD_STEP_SEC = 0.4;
const WORD_LENGTH_SEC = 0.3;

const round = (value: number): number => Math.round(value * 100) / 100;

/** Слова фразы (через пробел) с началом в `fromSec`. */
export const timedWords = (
    text: string,
    fromSec: number,
    channel: string | null = '1',
): TimedWord[] =>
    text.split(' ').map((word, index) => ({
        word,
        startSec: round(fromSec + index * WORD_STEP_SEC),
        endSec: round(fromSec + index * WORD_STEP_SEC + WORD_LENGTH_SEC),
        channel,
    }));

/** Те же слова в другом канале (эхо), начало и конец сдвинуты на `shiftSec`. */
export const inChannel = (
    words: readonly TimedWord[],
    channel: string,
    shiftSec = 0,
): TimedWord[] =>
    words.map(word => ({
        ...word,
        channel,
        startSec: round(word.startSec + shiftSec),
        endSec: round(word.endSec + shiftSec),
    }));

/** Фраза из пронумерованных слов: «слово1 слово2 …». */
export const numberedPhrase = (prefix: string, count: number): string =>
    Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(
        ' ',
    );

/** Кусок ответа Яндекса из слов одного канала (канал — по первому слову). */
export const yandexChunk = (words: readonly TimedWord[]): IYAChanks => ({
    channelTag: words[0]?.channel ?? undefined,
    alternatives: [
        {
            text: words.map(word => word.word).join(' '),
            words: words.map(word => ({
                word: word.word,
                startTime: `${word.startSec}s`,
                endTime: `${word.endSec}s`,
            })),
        },
    ],
});
