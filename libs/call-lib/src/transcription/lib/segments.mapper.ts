/**
 * Сегменты транскрипции из ответов провайдеров (поток П6 Фазы 3):
 * Yandex SpeechKit отдаёт слова с временем начала/конца и номером канала,
 * Whisper через Vibecode — готовые сегменты `verbose_json`. Оба пути
 * сводятся к одному контракту `TranscriptSegment`.
 *
 * Слова режутся на сегменты по паузе длиннее `pauseSec` и по смене
 * канала (говорящего). Каналы моно-записи спикеров не различают — все
 * сегменты `unknown`; при двух каналах первый считается менеджером
 * (исходящий звонок — менеджер на канале 1), второй — клиентом.
 *
 * Чистые функции: без DI и сети.
 */
import type {
    TranscriptSegment,
    TranscriptSpeaker,
} from '../types/transcript-segment.types';

/** Слово провайдера с временем (секунды). */
export interface TimedWord {
    word: string;
    startSec: number;
    endSec: number;
    /** Канал записи ('1', '2'); нет — моно. */
    channel?: string | null;
}

export interface WordsToSegmentsOptions {
    /** Пауза между словами, с которой начинается новый сегмент. */
    pauseSec?: number;
    /** Канал → говорящий; нет карты — все unknown. */
    speakers?: Readonly<Record<string, TranscriptSpeaker>>;
}

/** Пауза по умолчанию — 1,5 с (граница реплики в разговоре). */
export const SEGMENT_PAUSE_SEC = 1.5;

/** Yandex: строка длительности '1.879999999s' → секунды. */
export function yandexSecondsOf(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== 'string') return null;
    const parsed = Number.parseFloat(value.replace(/s$/, ''));

    return Number.isFinite(parsed) ? parsed : null;
}

/** Слова из ответа `longRunningRecognize` (v2): chunks → alternatives[0].words. */
export function yandexWordsOf(chunks: unknown): TimedWord[] {
    if (!Array.isArray(chunks)) return [];
    const words: TimedWord[] = [];
    for (const chunk of chunks) {
        if (typeof chunk !== 'object' || chunk === null) continue;
        const record = chunk as Record<string, unknown>;
        const channel =
            typeof record.channelTag === 'string' ? record.channelTag : null;
        const alternatives = Array.isArray(record.alternatives)
            ? record.alternatives
            : [];
        const first = alternatives[0] as Record<string, unknown> | undefined;
        const list = Array.isArray(first?.words) ? first.words : [];
        for (const item of list) {
            if (typeof item !== 'object' || item === null) continue;
            const word = item as Record<string, unknown>;
            const startSec = yandexSecondsOf(word.startTime);
            const endSec = yandexSecondsOf(word.endTime);
            if (
                typeof word.word !== 'string' ||
                startSec === null ||
                endSec === null
            ) {
                continue;
            }
            words.push({ word: word.word, startSec, endSec, channel });
        }
    }

    return words;
}

/** Слова → сегменты по паузе и смене канала. */
export function wordsToSegments(
    words: readonly TimedWord[],
    options: WordsToSegmentsOptions = {},
): TranscriptSegment[] {
    const pauseSec = options.pauseSec ?? SEGMENT_PAUSE_SEC;
    const speakerOf = (channel: string | null | undefined): TranscriptSpeaker =>
        (channel ? options.speakers?.[channel] : undefined) ?? 'unknown';
    const sorted = [...words].sort((a, b) => a.startSec - b.startSec);
    const segments: TranscriptSegment[] = [];
    let current: (TranscriptSegment & { words: string[] }) | null = null;
    let lastChannel: string | null | undefined;
    for (const word of sorted) {
        const gap = current === null ? 0 : word.startSec - current.endSec;
        const sameChannel = current === null || word.channel === lastChannel;
        if (current === null || gap > pauseSec || !sameChannel) {
            if (current !== null) segments.push(finish(current));
            current = {
                startSec: word.startSec,
                endSec: word.endSec,
                speaker: speakerOf(word.channel),
                text: '',
                words: [word.word],
            };
        } else {
            current.words.push(word.word);
            current.endSec = Math.max(current.endSec, word.endSec);
        }
        lastChannel = word.channel;
    }
    if (current !== null) segments.push(finish(current));

    return segments;
}

function finish(
    segment: TranscriptSegment & { words: string[] },
): TranscriptSegment {
    return {
        startSec: round(segment.startSec),
        endSec: round(segment.endSec),
        speaker: segment.speaker,
        text: segment.words.join(' ').trim(),
    };
}

/** Секунды с точностью до сотых — таймкоду хватает, JSON короче. */
const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Сегменты Whisper (`verbose_json`: `segments[].start/end/text`) →
 * контракт. Говорящего Whisper не различает — unknown.
 */
export function whisperSegmentsOf(value: unknown): TranscriptSegment[] {
    if (!Array.isArray(value)) return [];
    const segments: TranscriptSegment[] = [];
    for (const item of value) {
        if (typeof item !== 'object' || item === null) continue;
        const record = item as Record<string, unknown>;
        const start = record.start;
        const end = record.end;
        if (
            typeof start !== 'number' ||
            typeof end !== 'number' ||
            !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            typeof record.text !== 'string' ||
            record.text.trim() === ''
        ) {
            continue;
        }
        segments.push({
            startSec: round(Math.max(0, start)),
            endSec: round(Math.max(start, end)),
            speaker: 'unknown',
            text: record.text.trim(),
        });
    }

    return segments;
}
