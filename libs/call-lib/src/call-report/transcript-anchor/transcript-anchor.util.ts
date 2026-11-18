/**
 * Привязка места разбора к репликам расшифровки. Разбор хранит цитату и
 * (у возражений, риск-флагов и пунктов методики) время в звонке. Ищем так:
 * 1) цитата дословно — если совпадений несколько, берём ближайшее к времени;
 * 2) цитата с пропуском («…») — по частям; длинная без точного совпадения —
 *    по началу и концу;
 * 3) текста не нашли, но время есть — реплики, которые на это время попадают.
 * Сравнение без регистра, знаков и «ё». Чистые функции.
 *
 * Общий поиск страницы звонка и приёма разбора (проверка времени цитат,
 * задание focus-v3.4) — перенесён из kpi-report-sales без изменений.
 */
import type {
    AnchorSegment,
    TranscriptAnchor,
    TranscriptAnchorIndex,
    TranscriptAnchorMatch,
} from './transcript-anchor.types';

/** Слов в начале и конце длинной цитаты, по которым ищем без точного совпадения. */
const EDGE_WORDS = 4;
/** С какой длины цитаты (в словах) допустим поиск по началу и концу. */
const EDGE_MIN_WORDS = 8;
/** Одно слово ищем только рядом с названным временем, секунд. */
const SINGLE_WORD_WINDOW_SEC = 60;
/** Следующую часть цитаты ищем не дальше стольких слов от предыдущей. */
const NEXT_PART_MAX_GAP = 400;
/** Больше стольких реплик по одному только времени не подсвечиваем. */
const TIME_ONLY_MAX_SEGMENTS = 12;

/** Слова текста: строчные, «ё» как «е», без знаков. */
export function wordsOf(text: string): string[] {
    return (
        text
            .toLowerCase()
            .replace(/ё/g, 'е')
            .match(/[a-zа-я0-9]+/g) ?? []
    );
}

export function indexTranscript(
    segments: readonly AnchorSegment[],
): TranscriptAnchorIndex {
    const words: string[] = [];
    const owners: number[] = [];
    segments.forEach((segment, position) => {
        for (const word of wordsOf(segment.text)) {
            words.push(word);
            owners.push(position);
        }
    });
    return { segments, words, owners };
}

/** Отрезок слов расшифровки: позиции первого и последнего слова. */
interface WordSpan {
    from: number;
    to: number;
}

/** Все места, где слова цитаты идут в расшифровке подряд. */
function exactSpans(
    words: readonly string[],
    needle: readonly string[],
): WordSpan[] {
    const spans: WordSpan[] = [];
    if (needle.length === 0) return spans;
    for (let start = 0; start + needle.length <= words.length; start++) {
        let matched = 0;
        while (
            matched < needle.length &&
            words[start + matched] === needle[matched]
        ) {
            matched++;
        }
        if (matched === needle.length) {
            spans.push({ from: start, to: start + needle.length - 1 });
        }
    }
    return spans;
}

/** Длинная цитата без точного совпадения: от её начала до её конца. */
function edgeSpans(
    words: readonly string[],
    needle: readonly string[],
): WordSpan[] {
    if (needle.length < EDGE_MIN_WORDS) return [];
    const heads = exactSpans(words, needle.slice(0, EDGE_WORDS));
    const tails = exactSpans(words, needle.slice(-EDGE_WORDS));
    const reach = needle.length * 2;
    const spans: WordSpan[] = [];
    for (const head of heads) {
        const tail = tails.find(
            item => item.from > head.to && item.to - head.from <= reach,
        );
        spans.push({ from: head.from, to: tail ? tail.to : head.to });
    }
    return spans.length > 0 ? spans : tails;
}

/** Части цитаты между пропусками («…», «...», «[…]»), каждая — словами. */
function quoteParts(quote: string): string[][] {
    return quote
        .split(/\[?(?:…|\.{3,})\]?/)
        .map(wordsOf)
        .filter(part => part.length > 0);
}

const startOf = (index: TranscriptAnchorIndex, span: WordSpan): number | null =>
    index.segments[index.owners[span.from]].startSec;

/** Ближайший к времени отрезок; времени нет — первый. */
function nearest(
    index: TranscriptAnchorIndex,
    spans: readonly WordSpan[],
    atSec: number | null,
): WordSpan | null {
    if (spans.length === 0) return null;
    if (atSec === null) return spans[0];
    let best = spans[0];
    let bestGap = Number.POSITIVE_INFINITY;
    for (const span of spans) {
        const start = startOf(index, span);
        const gap = start === null ? bestGap : Math.abs(start - atSec);
        if (gap < bestGap) {
            best = span;
            bestGap = gap;
        }
    }
    return best;
}

/** Где в расшифровке первая часть цитаты. */
function firstPartSpan(
    index: TranscriptAnchorIndex,
    part: readonly string[],
    atSec: number | null,
): WordSpan | null {
    const exact = exactSpans(index.words, part);
    if (part.length === 1) {
        // Одно слово встречается где угодно: верим ему только рядом с временем.
        if (atSec === null) return null;
        const near = exact.filter(span => {
            const start = startOf(index, span);
            return (
                start !== null &&
                Math.abs(start - atSec) <= SINGLE_WORD_WINDOW_SEC
            );
        });
        return nearest(index, near, atSec);
    }
    return nearest(
        index,
        exact.length > 0 ? exact : edgeSpans(index.words, part),
        atSec,
    );
}

/** Следующая часть цитаты: первое совпадение после предыдущей, недалеко. */
function nextPartSpan(
    index: TranscriptAnchorIndex,
    part: readonly string[],
    after: WordSpan,
): WordSpan | null {
    if (part.length < 2) return null;
    const spans = [
        ...exactSpans(index.words, part),
        ...edgeSpans(index.words, part),
    ];
    return (
        spans
            .filter(
                span =>
                    span.from > after.to &&
                    span.from - after.to <= NEXT_PART_MAX_GAP,
            )
            .sort((a, b) => a.from - b.from)[0] ?? null
    );
}

function spansByText(
    index: TranscriptAnchorIndex,
    anchor: TranscriptAnchor,
): WordSpan[] {
    const parts = anchor.quote ? quoteParts(anchor.quote) : [];
    if (parts.length === 0) return [];
    const first = firstPartSpan(index, parts[0], anchor.startSec);
    if (first === null) return [];
    const spans = [first];
    for (const part of parts.slice(1)) {
        const next = nextPartSpan(index, part, spans[spans.length - 1]);
        if (next !== null) spans.push(next);
    }
    return spans;
}

/** Реплики, которые попадают на названное время (не больше TIME_ONLY_MAX_SEGMENTS). */
export function positionsByTime(
    segments: readonly AnchorSegment[],
    anchor: TranscriptAnchor,
): number[] {
    if (anchor.startSec === null) return [];
    const from = anchor.startSec;
    const to = Math.max(anchor.endSec ?? from, from);
    const positions: number[] = [];
    segments.forEach((segment, position) => {
        if (segment.startSec === null || segment.endSec === null) return;
        if (segment.startSec <= to && segment.endSec >= from) {
            positions.push(position);
        }
    });
    return positions.slice(0, TIME_ONLY_MAX_SEGMENTS);
}

/**
 * Позиции реплик, где цитата нашлась по тексту (при нескольких совпадениях
 * — ближайшее ко времени якоря); не нашлась — пусто.
 */
export function positionsByQuote(
    index: TranscriptAnchorIndex,
    anchor: TranscriptAnchor,
): number[] {
    const positions = new Set<number>();
    for (const span of spansByText(index, anchor)) {
        for (let word = span.from; word <= span.to; word++) {
            positions.add(index.owners[word]);
        }
    }
    return [...positions].sort((a, b) => a - b);
}

/** Реплики расшифровки, на которые ссылается место разбора. */
export function matchAnchor(
    index: TranscriptAnchorIndex,
    anchor: TranscriptAnchor,
): TranscriptAnchorMatch {
    const byQuote = positionsByQuote(index, anchor);
    const found =
        byQuote.length > 0 ? byQuote : positionsByTime(index.segments, anchor);
    const firstStart =
        found.length > 0 ? index.segments[found[0]].startSec : null;
    return {
        segmentIndexes: found.map(position => index.segments[position].index),
        startSec: firstStart ?? anchor.startSec,
    };
}
