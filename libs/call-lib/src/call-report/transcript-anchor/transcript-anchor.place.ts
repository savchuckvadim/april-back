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
 * - цитаты нет: время, только если оно больше нуля и внутри записи.
 *
 * Чистые функции.
 */

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
