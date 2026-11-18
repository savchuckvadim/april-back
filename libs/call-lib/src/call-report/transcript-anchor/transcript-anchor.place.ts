import { isTimecodeWithinDuration } from '../../transcription/types/transcript-segment.types';
import {
    quoteWordsNear,
    type EvidenceNearRule,
} from './transcript-anchor.evidence';
import type {
    TranscriptAnchor,
    TranscriptAnchorIndex,
    TranscriptAnchorMatch,
} from './transcript-anchor.types';
import {
    positionsByQuote,
    positionsByTime,
    wordsOf,
} from './transcript-anchor.util';

/**
 * Место разбора для кнопки «Показать в разговоре»: нет уверенности — нет
 * места (решение владельца 18.11.2026: лучше без кнопки, чем в самое начало
 * или за конец записи).
 *
 * - время из разбора вне записи (меньше 0 или больше её длины) — неизвестно;
 * - есть цитата: место по тексту; по тексту не нашлась — время из разбора,
 *   только если рядом с ним звучат её слова (та же проверка, что у приёма
 *   разбора, со своим окном); иначе места нет;
 * - цитаты нет: время, только если оно больше нуля и внутри записи;
 * - цитата-заглушка («Нет», «не было», прочерк) — места нет совсем.
 *
 * Чистые функции.
 */

/**
 * Цитаты-заглушки (слова через пробел): так модель помечает «доказательства
 * нет» — у невыполненных пунктов методики цитата «Нет» (gsr, 17.11.2026).
 * По тексту такая «цитата» находит слово «нет» в десятке реплик.
 */
const NO_EVIDENCE_QUOTES: ReadonlySet<string> = new Set([
    'нет',
    'не было',
    'отсутствует',
    'нет цитаты',
    'цитаты нет',
    'не найдено',
    'не найдена',
    'нет данных',
    'не указано',
    'null',
    'none',
]);

/** Цитата написана, но доказательства в ней нет: заглушка или одни знаки. */
function isNoEvidenceQuote(
    quote: string | null,
    quoteWords: readonly string[],
): boolean {
    if (quote === null || quote.trim() === '') return false;
    return (
        quoteWords.length === 0 || NO_EVIDENCE_QUOTES.has(quoteWords.join(' '))
    );
}

/** Секунда внутри записи; иначе (и не число) — null. */
function secondWithin(
    value: number | null,
    durationSec: number | null,
): number | null {
    return value !== null && isTimecodeWithinDuration(value, durationSec)
        ? value
        : null;
}

/** Реплики на это время; запись ставится на начало первой из них. */
function matchByTime(
    index: TranscriptAnchorIndex,
    startSec: number,
    endSec: number | null,
): TranscriptAnchorMatch {
    const positions = positionsByTime(index.segments, {
        quote: null,
        startSec,
        endSec,
    });
    const first = positions.length > 0 ? index.segments[positions[0]] : null;
    return {
        segmentIndexes: positions.map(
            position => index.segments[position].index,
        ),
        startSec: first?.startSec ?? startSec,
    };
}

/**
 * Проверенное место разбора в расшифровке; null — места нет (подсветки и
 * кнопки нет).
 */
export function locateCheckedAnchor(
    index: TranscriptAnchorIndex,
    anchor: TranscriptAnchor,
    durationSec: number | null,
    nearRule: EvidenceNearRule,
): TranscriptAnchorMatch | null {
    const startSec = secondWithin(anchor.startSec, durationSec);
    const endSec = secondWithin(anchor.endSec, durationSec);
    const quoteWords = anchor.quote ? wordsOf(anchor.quote) : [];
    if (isNoEvidenceQuote(anchor.quote, quoteWords)) return null;
    if (quoteWords.length === 0) {
        return startSec !== null && startSec > 0
            ? matchByTime(index, startSec, endSec)
            : null;
    }
    const byQuote = positionsByQuote(index, {
        quote: anchor.quote,
        startSec,
        endSec,
    });
    if (byQuote.length > 0) {
        return {
            segmentIndexes: byQuote.map(
                position => index.segments[position].index,
            ),
            startSec: index.segments[byQuote[0]].startSec,
        };
    }
    return startSec !== null &&
        quoteWordsNear(index, quoteWords, startSec, nearRule)
        ? matchByTime(index, startSec, endSec)
        : null;
}
