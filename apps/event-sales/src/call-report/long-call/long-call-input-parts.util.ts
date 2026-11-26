import { partWithoutDigestReason } from './long-call-input-heading.util';
import type {
    ExcerptCandidate,
    LineRange,
    PreparedTranscript,
    TimeSpan,
} from './long-call-input.types';
import type { DigestedPart, TranscriptPart } from './long-call.types';

/**
 * Где части лежат в строках исходной расшифровки и какие из них надо дать
 * дословно целиком (конспекта нет).
 *
 * Части должны быть получены резкой этой же расшифровки с тем же размером
 * части, что передан в prepareTranscript: тогда строки части совпадают со
 * строками записи.
 */

const PART_LINE_SEPARATOR = '\n';

/** Позиция первой строки, с которой строки записи совпадают с texts; нет — -1. */
function findLineSequence(
    transcript: PreparedTranscript,
    texts: readonly string[],
    fromIndex: number,
): number {
    const last = transcript.lines.length - texts.length;
    for (let start = fromIndex; start <= last; start++) {
        if (
            texts.every(
                (text, offset) =>
                    transcript.lines[start + offset].text === text,
            )
        ) {
            return start;
        }
    }

    return -1;
}

/**
 * Диапазон строк каждой части по её номеру. Части идут по порядку и
 * перекрываются, поэтому каждая следующая ищется правее начала предыдущей.
 * Часть, которой в записи нет, в результат не попадает.
 */
export function locatePartRanges(
    transcript: PreparedTranscript,
    parts: readonly DigestedPart[],
): Map<number, LineRange> {
    const ranges = new Map<number, LineRange>();
    let cursor = 0;
    for (const { part } of parts) {
        const texts = part.text.split(PART_LINE_SEPARATOR);
        const start = findLineSequence(transcript, texts, cursor);
        if (start === -1) continue;
        ranges.set(part.number, { from: start, to: start + texts.length - 1 });
        cursor = start + 1;
    }

    return ranges;
}

/** Время части: обе границы известны — отрезок, иначе null. */
function partSpan(part: TranscriptPart): TimeSpan | null {
    return part.fromSec === null || part.toSec === null
        ? null
        : { fromSec: part.fromSec, toSec: part.toSec };
}

/** Части без конспекта как отрывки: их текст входит в отрывки целиком. */
export function partsWithoutDigest(
    parts: readonly DigestedPart[],
    ranges: ReadonlyMap<number, LineRange>,
): ExcerptCandidate[] {
    return parts.flatMap(({ part, digest }) => {
        const range = ranges.get(part.number);
        if (digest !== null || range === undefined) return [];
        const reason = partWithoutDigestReason(part.number);

        return [
            {
                source: 'part' as const,
                range,
                reason,
                heading: reason,
                span: partSpan(part),
            },
        ];
    });
}
