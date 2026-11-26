import { LONG_CALL_PART_CHARS } from './long-call.const';
import { LONG_CALL_LINE_BREAK_CHARS } from './long-call-input.const';
import type { LineRange, PreparedTranscript } from './long-call-input.types';
import { normalizeQuote } from './long-call-digest-events.util';
import { splitLongLine } from './long-call-split.util';
import { transcriptLines } from './long-call-timecode.util';

/**
 * Расшифровка по строкам и выбор диапазонов строк: начало, конец, время,
 * цитата. Строки те же, что у резки на части (длинная строка — по
 * предложениям), поэтому часть находится в них по тексту.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */

/** Строки исходной расшифровки с секундами звучания каждой. */
export function prepareTranscript(text: string): PreparedTranscript {
    const lines = transcriptLines(text).flatMap(line =>
        splitLongLine(line, LONG_CALL_PART_CHARS),
    );
    let current: number | null = null;
    const secs = lines.map(line => {
        current = line.sec ?? current;

        return current;
    });
    const marked = lines.filter(line => line.sec !== null);

    return {
        lines,
        normalized: lines.map(line => normalizeQuote(line.text)),
        secs,
        lastSec: marked.length > 0 ? marked[marked.length - 1].sec : null,
    };
}

/** Сколько знаков строка занимает в бюджете: сама строка и перевод строки. */
export const lineSize = (
    transcript: PreparedTranscript,
    index: number,
): number => transcript.lines[index].text.length + LONG_CALL_LINE_BREAK_CHARS;

/** Строки диапазона как они в исходнике, без изменений. */
export const rangeTexts = (
    transcript: PreparedTranscript,
    range: LineRange,
): string[] =>
    transcript.lines.slice(range.from, range.to + 1).map(line => line.text);

/**
 * Целые строки с начала, общей длиной (со всеми переводами строк) не больше
 * maxChars. Первая строка длиннее — блока нет.
 */
export function headRange(
    transcript: PreparedTranscript,
    maxChars: number,
): LineRange | null {
    let used = 0;
    let to = -1;
    for (let index = 0; index < transcript.lines.length; index++) {
        const next =
            used +
            transcript.lines[index].text.length +
            (index > 0 ? LONG_CALL_LINE_BREAK_CHARS : 0);
        if (next > maxChars) break;
        used = next;
        to = index;
    }

    return to >= 0 ? { from: 0, to } : null;
}

/**
 * Целые строки с конца, общей длиной не больше maxChars; строки блока
 * «начало» (after) не берутся.
 */
export function tailRange(
    transcript: PreparedTranscript,
    maxChars: number,
    after: LineRange | null,
): LineRange | null {
    const last = transcript.lines.length - 1;
    const floor = after ? after.to + 1 : 0;
    let used = 0;
    let from = last + 1;
    for (let index = last; index >= floor; index--) {
        const next =
            used +
            transcript.lines[index].text.length +
            (index < last ? LONG_CALL_LINE_BREAK_CHARS : 0);
        if (next > maxChars) break;
        used = next;
        from = index;
    }

    return from <= last ? { from, to: last } : null;
}

/**
 * Строки, звучавшие в отрезке [fromSec, toSec] (границы включены); строка
 * без метки звучит во время предыдущей строки с меткой. Таких строк нет —
 * null.
 */
export function linesInTimeRange(
    transcript: PreparedTranscript,
    fromSec: number,
    toSec: number,
): LineRange | null {
    let from = -1;
    let to = -1;
    transcript.secs.forEach((sec, index) => {
        if (sec === null || sec < fromSec || sec > toSec) return;
        if (from === -1) from = index;
        to = index;
    });

    return from === -1 ? null : { from, to };
}

/** Первая строка диапазона (или всех строк), где есть цитата; нет — -1. */
function findQuoteLine(
    transcript: PreparedTranscript,
    needle: string,
    within: LineRange | null,
): number {
    const start = within?.from ?? 0;
    const end = within?.to ?? transcript.normalized.length - 1;
    for (let index = start; index <= end; index++) {
        if (transcript.normalized[index].includes(needle)) return index;
    }

    return -1;
}

/** Крайняя строка, до которой доходит радиус в знаках от строки at (step: -1 назад, 1 вперёд). */
function reach(
    transcript: PreparedTranscript,
    at: number,
    radiusChars: number,
    step: -1 | 1,
): number {
    let used = 0;
    let edge = at;
    for (
        let index = at + step;
        index >= 0 && index < transcript.lines.length;
        index += step
    ) {
        used += lineSize(transcript, index);
        if (used > radiusChars) break;
        edge = index;
    }

    return edge;
}

/**
 * Строка с цитатой (без учёта регистра и повторных пробелов) и соседние
 * строки в пределах радиуса в знаках с каждой стороны. Сначала цитата ищется
 * в строках prefer (часть, где её нашла модель), затем во всей записи; не
 * нашли — null.
 */
export function linesAroundQuote(
    transcript: PreparedTranscript,
    quote: string,
    radiusChars: number,
    prefer: LineRange | null,
): LineRange | null {
    const needle = normalizeQuote(quote);
    if (needle.length === 0) return null;
    let at = prefer ? findQuoteLine(transcript, needle, prefer) : -1;
    if (at === -1) at = findQuoteLine(transcript, needle, null);
    if (at === -1) return null;

    return {
        from: reach(transcript, at, radiusChars, -1),
        to: reach(transcript, at, radiusChars, 1),
    };
}
