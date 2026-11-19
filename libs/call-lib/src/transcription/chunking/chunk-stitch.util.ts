/**
 * Склейка распознанных кусков записи в один текст с таймкодами.
 *
 * Сегменты куска считаются от его начала — сдвигаются на начало куска.
 * Граница между соседними кусками — середина их нахлёста: кусок отдаёт
 * сегменты, чья середина лежит в его зоне. Зона расширена на
 * {@link ZONE_SLACK_SEC} в обе стороны: таймкоды одной фразы в двух
 * кусках расходятся на доли секунды, и строгая граница могла бы потерять
 * фразу у самого стыка (оба куска отнесли бы её соседу). Попавшую в оба
 * куска фразу убирает поиск повтора на стыке (chunk-joint.util).
 *
 * Кусок без таймкодов (распознаватель их не дал) входит текстом целиком
 * одним сегментом на свою зону, звонок помечается «без таймкодов». Нет
 * таймкодов ни у одного куска — сегментов нет вовсе (null), как у
 * распознавателя без таймкодов: разбор возьмёт обычный текст.
 *
 * Чистые функции: без DI и сети.
 */
import type { TranscriptSegment } from '../types/transcript-segment.types';
import { trimJointRepeat } from './chunk-joint.util';

/** Запас зоны куска у границы, секунд. */
export const ZONE_SLACK_SEC = 1;

/** Распознанный кусок: границы в секундах записи, сегменты — от начала куска. */
export interface RecognizedChunk {
    startSec: number;
    endSec: number;
    text: string;
    segments: readonly TranscriptSegment[] | null;
}

export interface StitchedTranscript {
    text: string;
    /** null — ни у одного куска не было таймкодов. */
    segments: TranscriptSegment[] | null;
    /** Хотя бы один кусок без таймкодов. */
    untimed: boolean;
}

type ChunkKind = 'timed' | 'untimed' | 'silent';

interface Zone {
    from: number;
    to: number;
}

interface OwnPieces {
    kind: ChunkKind;
    pieces: TranscriptSegment[];
}

/** Секунды с точностью до сотых — как у сегментов распознавателей. */
const round = (value: number): number => Math.round(value * 100) / 100;

/** Середина нахлёста соседних кусков. */
const boundary = (left: RecognizedChunk, right: RecognizedChunk): number =>
    (right.startSec + left.endSec) / 2;

function zoneOf(chunks: readonly RecognizedChunk[], index: number): Zone {
    return {
        from:
            index === 0
                ? Number.NEGATIVE_INFINITY
                : boundary(chunks[index - 1], chunks[index]),
        to:
            index === chunks.length - 1
                ? Number.POSITIVE_INFINITY
                : boundary(chunks[index], chunks[index + 1]),
    };
}

/** Сегменты куска в его зоне (время — от начала записи). */
function ownPieces(chunk: RecognizedChunk, zone: Zone): OwnPieces {
    const segments = chunk.segments ?? [];
    if (segments.length > 0) {
        const pieces = segments
            .map(segment => ({
                ...segment,
                startSec: round(segment.startSec + chunk.startSec),
                endSec: round(segment.endSec + chunk.startSec),
                text: segment.text.trim(),
            }))
            .filter(segment => {
                const middle = (segment.startSec + segment.endSec) / 2;
                return (
                    segment.text !== '' &&
                    middle >= zone.from - ZONE_SLACK_SEC &&
                    middle < zone.to + ZONE_SLACK_SEC
                );
            });
        return { kind: 'timed', pieces };
    }
    const text = chunk.text.trim();
    if (!text) return { kind: 'silent', pieces: [] };
    return {
        kind: 'untimed',
        pieces: [
            {
                startSec: round(Math.max(zone.from, chunk.startSec)),
                endSec: round(Math.min(zone.to, chunk.endSec)),
                speaker: 'unknown',
                text,
            },
        ],
    };
}

/**
 * Куски (в любом порядке) → текст и сегменты всей записи. Текст —
 * сегменты через пробел.
 */
export function stitchChunkTranscripts(
    chunks: readonly RecognizedChunk[],
): StitchedTranscript {
    const ordered = [...chunks].sort((a, b) => a.startSec - b.startSec);
    let pieces: TranscriptSegment[] = [];
    let previous: { chunk: RecognizedChunk; kind: ChunkKind } | null = null;
    let timed = false;
    let untimed = false;

    for (const [index, chunk] of ordered.entries()) {
        const own = ownPieces(chunk, zoneOf(ordered, index));
        if (own.kind === 'timed') timed = true;
        if (own.kind === 'untimed') untimed = true;
        if (own.pieces.length === 0) continue;
        if (previous) {
            const joint = trimJointRepeat(pieces, own.pieces, {
                bothTimed: previous.kind === 'timed' && own.kind === 'timed',
                overlapSec: previous.chunk.endSec - chunk.startSec,
            });
            pieces = [...joint.left, ...joint.right];
        } else {
            pieces = own.pieces;
        }
        previous = { chunk, kind: own.kind };
    }

    return {
        text: pieces.map(piece => piece.text).join(' '),
        segments: timed && pieces.length > 0 ? pieces : null,
        untimed,
    };
}
