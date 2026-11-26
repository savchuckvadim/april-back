import { LONG_CALL_TAIL_SHARE } from './long-call.const';
import type { TranscriptLine, TranscriptPart } from './long-call.types';
import { transcriptLines } from './long-call-timecode.util';

/**
 * Резка длинной расшифровки на части. Режем только по границам строк;
 * строка длиннее части — по границам предложений, а если и так не вышло — по
 * знакам. Каждая следующая часть начинается с последних строк предыдущей
 * (перекрытие), короткий хвост приклеивается к предыдущей части.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */

export interface SplitOptions {
    /** Размер части, знаков. */
    partChars: number;
    /** Перекрытие соседних частей, знаков. */
    overlapChars: number;
}

/** Граница предложения: пробелы после `.`, `?`, `!` или `…`. */
const SENTENCE_BOUNDARY = /(?<=[.?!…])\s+/;
/** Перевод строки между строками части. */
const LINE_SEPARATOR = '\n';
const SEPARATOR_CHARS = LINE_SEPARATOR.length;

/** Часть в сборке: строки и сколько первых из них — повтор предыдущей части. */
interface PartDraft {
    lines: TranscriptLine[];
    overlapLines: number;
    chars: number;
}

/** Длина строк, склеенных переводами строк. */
const joinedLength = (lines: readonly TranscriptLine[]): number =>
    lines.reduce(
        (sum, line, index) =>
            sum + line.text.length + (index > 0 ? SEPARATOR_CHARS : 0),
        0,
    );

/** Длинная расшифровка: не короче порога (по тексту без крайних пробелов). */
export function isLongTranscript(
    text: string,
    thresholdChars: number,
): boolean {
    return text.trim().length >= thresholdChars;
}

/** Кусок текста по знакам, не длиннее размера части. */
function sliceByChars(text: string, partChars: number): string[] {
    const pieces: string[] = [];
    for (let start = 0; start < text.length; start += partChars) {
        pieces.push(text.slice(start, start + partChars));
    }

    return pieces;
}

/**
 * Строка длиннее части — на предложения (слишком длинное предложение — по
 * знакам). Метка времени остаётся у первого куска, у остальных её нет.
 */
export function splitLongLine(
    line: TranscriptLine,
    partChars: number,
): TranscriptLine[] {
    if (line.text.length <= partChars) return [line];
    const pieces = line.text
        .split(SENTENCE_BOUNDARY)
        .filter(sentence => sentence.length > 0)
        .flatMap(sentence =>
            sentence.length > partChars
                ? sliceByChars(sentence, partChars)
                : [sentence],
        );

    return pieces.map((text, index) => ({
        text,
        sec: index === 0 ? line.sec : null,
    }));
}

/** Последние строки с общей длиной не больше перекрытия (целыми строками). */
function overlapOf(
    lines: readonly TranscriptLine[],
    overlapChars: number,
): TranscriptLine[] {
    const overlap: TranscriptLine[] = [];
    let chars = 0;
    for (let index = lines.length - 1; index >= 0; index--) {
        const next =
            chars +
            lines[index].text.length +
            (overlap.length > 0 ? SEPARATOR_CHARS : 0);
        if (next > overlapChars) break;
        overlap.unshift(lines[index]);
        chars = next;
    }

    return overlap;
}

/** Новая часть: перекрытие с предыдущей, урезанное так, чтобы строка влезла. */
function startDraft(
    previous: readonly TranscriptLine[],
    next: TranscriptLine,
    options: SplitOptions,
): PartDraft {
    let overlap = overlapOf(previous, options.overlapChars);
    while (
        overlap.length > 0 &&
        joinedLength(overlap) + SEPARATOR_CHARS + next.text.length >
            options.partChars
    ) {
        overlap = overlap.slice(1);
    }

    return {
        lines: [...overlap],
        overlapLines: overlap.length,
        chars: joinedLength(overlap),
    };
}

function addLine(draft: PartDraft, line: TranscriptLine): void {
    draft.chars +=
        line.text.length + (draft.lines.length > 0 ? SEPARATOR_CHARS : 0);
    draft.lines.push(line);
}

/** Жадная упаковка строк в части с перекрытием. */
function packLines(
    lines: readonly TranscriptLine[],
    options: SplitOptions,
): PartDraft[] {
    const drafts: PartDraft[] = [];
    let current: PartDraft = { lines: [], overlapLines: 0, chars: 0 };
    for (const line of lines) {
        const hasOwnLines = current.lines.length > current.overlapLines;
        if (
            hasOwnLines &&
            current.chars + SEPARATOR_CHARS + line.text.length >
                options.partChars
        ) {
            drafts.push(current);
            current = startDraft(current.lines, line, options);
        }
        addLine(current, line);
    }
    if (current.lines.length > 0) drafts.push(current);

    return drafts;
}

/** Хвост короче доли размера части приклеивается к предыдущей части. */
function mergeShortTail(drafts: PartDraft[], partChars: number): PartDraft[] {
    if (drafts.length < 2) return drafts;
    const tail = drafts[drafts.length - 1];
    const ownLines = tail.lines.slice(tail.overlapLines);
    if (joinedLength(ownLines) >= partChars * LONG_CALL_TAIL_SHARE) {
        return drafts;
    }
    const previous = drafts[drafts.length - 2];
    const merged: PartDraft = {
        lines: [...previous.lines, ...ownLines],
        overlapLines: previous.overlapLines,
        chars: joinedLength([...previous.lines, ...ownLines]),
    };

    return [...drafts.slice(0, -2), merged];
}

function toPart(
    draft: PartDraft,
    number: number,
    total: number,
): TranscriptPart {
    const marks = draft.lines
        .map(line => line.sec)
        .filter((sec): sec is number => sec !== null);

    return {
        number,
        total,
        text: draft.lines.map(line => line.text).join(LINE_SEPARATOR),
        fromSec: marks.length > 0 ? marks[0] : null,
        toSec: marks.length > 0 ? marks[marks.length - 1] : null,
    };
}

/**
 * Расшифровка → части по порядку. Текст не длиннее части — одна часть;
 * пустой — пустой список. Пустые строки отбрасываются.
 */
export function splitTranscript(
    text: string,
    options: SplitOptions,
): TranscriptPart[] {
    if (!(options.partChars > 0)) {
        throw new RangeError('partChars должен быть больше нуля');
    }
    const lines = transcriptLines(text).flatMap(line =>
        splitLongLine(line, options.partChars),
    );
    const drafts = mergeShortTail(packLines(lines, options), options.partChars);

    return drafts.map((draft, index) =>
        toPart(draft, index + 1, drafts.length),
    );
}
