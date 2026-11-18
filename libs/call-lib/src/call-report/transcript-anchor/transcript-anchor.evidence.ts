import {
    isTimecodeWithinDuration,
    type TranscriptSegment,
} from '../../transcription/types/transcript-segment.types';
import type {
    AnchorSegment,
    TranscriptAnchorIndex,
} from './transcript-anchor.types';
import {
    indexTranscript,
    positionsByQuote,
    wordsOf,
} from './transcript-anchor.util';

/**
 * Проверка времени цитаты модели по расшифровке (задание focus-v3.4): по
 * цитате и секунде страница разбора ставит кнопку «Показать в разговоре»,
 * поэтому выдуманную секунду нельзя пропускать дальше приёма разбора.
 *
 * - цитата нашлась в расшифровке → секунда — начало найденной реплики
 *   (время модели поправляется по тексту);
 * - не нашлась → секунда остаётся, только если она внутри записи и рядом с
 *   ней звучит большая часть слов цитаты; иначе снимается;
 * - сверять не с чем (нет реплик с текстом) → только «внутри записи».
 *
 * Чистые функции.
 */

/** Окно вокруг секунды модели, где ищем слова цитаты, сек. */
export const EVIDENCE_WINDOW_BEFORE_SEC = 15;
export const EVIDENCE_WINDOW_AFTER_SEC = 45;
/** Какая доля значимых слов цитаты должна прозвучать в окне. */
export const EVIDENCE_MIN_WORD_SHARE = 0.6;
/** Значимое слово — не короче стольких букв (без «и», «на», «да»). */
export const EVIDENCE_MIN_WORD_LETTERS = 3;
/** Цитата короче стольких слов — не цитата. */
export const EVIDENCE_MIN_QUOTE_WORDS = 2;
/** С какого расхождения поправку времени по тексту считаем заметной, сек. */
export const EVIDENCE_SNAP_GAP_SEC = 30;

/**
 * Итог проверки места: text — цитата найдена по тексту; near — по тексту не
 * найдена, но её слова звучат рядом с секундой; unchecked — сверять не с
 * чем, секунда внутри записи; no_quote — цитаты нет, секунда внутри записи;
 * dropped — места нет (секунда снята или её не было).
 */
export const EVIDENCE_CHECKS = [
    'text',
    'near',
    'unchecked',
    'no_quote',
    'dropped',
] as const;
export type EvidenceCheck = (typeof EVIDENCE_CHECKS)[number];

export interface EvidenceTime {
    /** Проверенная секунда; null — места нет. */
    startSec: number | null;
    check: EvidenceCheck;
    /** Секунда поправлена по тексту больше чем на EVIDENCE_SNAP_GAP_SEC. */
    snapped: boolean;
}

/** Реплики расшифровки для проверки; без реплик — null (сверять не с чем). */
export function evidenceIndexOf(
    segments: readonly TranscriptSegment[] | null | undefined,
): TranscriptAnchorIndex | null {
    if (!segments || segments.length === 0) return null;
    const anchorSegments: AnchorSegment[] = segments.map((segment, index) => ({
        index,
        startSec: segment.startSec,
        endSec: segment.endSec,
        text: segment.text,
    }));
    return indexTranscript(anchorSegments);
}

/** Где и как строго искать слова цитаты рядом с секундой модели. */
export interface EvidenceNearRule {
    /** Окно до и после секунды, сек. */
    beforeSec: number;
    afterSec: number;
    /** Значимое слово — не короче стольких букв. */
    minWordLetters: number;
    /** Какая доля значимых слов цитаты должна прозвучать в окне. */
    minWordShare: number;
}

/** Правило приёма разбора (focus-v3.4). */
export const EVIDENCE_NEAR_RULE: EvidenceNearRule = {
    beforeSec: EVIDENCE_WINDOW_BEFORE_SEC,
    afterSec: EVIDENCE_WINDOW_AFTER_SEC,
    minWordLetters: EVIDENCE_MIN_WORD_LETTERS,
    minWordShare: EVIDENCE_MIN_WORD_SHARE,
};

/** Звучит ли большая часть значимых слов цитаты рядом с секундой. */
export function quoteWordsNear(
    index: TranscriptAnchorIndex,
    quoteWords: readonly string[],
    atSec: number,
    rule: EvidenceNearRule = EVIDENCE_NEAR_RULE,
): boolean {
    if (quoteWords.length === 0) return false;
    const from = atSec - rule.beforeSec;
    const to = atSec + rule.afterSec;
    const heard = new Set<string>();
    for (const segment of index.segments) {
        if (segment.startSec === null || segment.endSec === null) continue;
        if (segment.startSec <= to && segment.endSec >= from) {
            for (const word of wordsOf(segment.text)) heard.add(word);
        }
    }
    const significant = quoteWords.filter(
        word => word.length >= rule.minWordLetters,
    );
    const needle = significant.length > 0 ? significant : quoteWords;
    const found = needle.filter(word => heard.has(word)).length;
    return found / needle.length >= rule.minWordShare;
}

/** Проверка секунды одного места разбора по его цитате. */
export function verifyEvidenceTime(
    index: TranscriptAnchorIndex | null,
    quote: string | null | undefined,
    startSec: number | null | undefined,
    durationSec: number | null,
): EvidenceTime {
    const sec =
        typeof startSec === 'number' &&
        isTimecodeWithinDuration(startSec, durationSec)
            ? startSec
            : null;
    const quoteWords = quote ? wordsOf(quote) : [];
    if (quoteWords.length < EVIDENCE_MIN_QUOTE_WORDS) {
        return sec === null
            ? { startSec: null, check: 'dropped', snapped: false }
            : { startSec: sec, check: 'no_quote', snapped: false };
    }
    if (index === null) {
        return sec === null
            ? { startSec: null, check: 'dropped', snapped: false }
            : { startSec: sec, check: 'unchecked', snapped: false };
    }
    const positions = positionsByQuote(index, {
        quote: quote ?? null,
        startSec: sec,
        endSec: null,
    });
    const found =
        positions.length > 0 ? index.segments[positions[0]].startSec : null;
    if (found !== null) {
        return {
            startSec: found,
            check: 'text',
            snapped:
                sec !== null && Math.abs(found - sec) > EVIDENCE_SNAP_GAP_SEC,
        };
    }
    if (sec !== null && quoteWordsNear(index, quoteWords, sec)) {
        return { startSec: sec, check: 'near', snapped: false };
    }
    return { startSec: null, check: 'dropped', snapped: false };
}
