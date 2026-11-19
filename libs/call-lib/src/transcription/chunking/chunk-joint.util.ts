/**
 * Повтор на стыке двух кусков записи: соседние куски перекрываются, и
 * речь из нахлёста распознаётся дважды. По таймкодам повтор отсекает
 * склейка (chunk-stitch.util); здесь — то, что таймкодами не решается:
 * кусок без таймкодов и сегмент, который длиннее нахлёста и попал в оба
 * куска. Сравнение по словам без регистра и знаков препинания.
 *
 * Чистые функции: без DI и сети.
 */
import type { TranscriptSegment } from '../types/transcript-segment.types';

/** Самый длинный повтор, который ищем на стыке, слов. */
export const JOINT_MAX_MATCH_WORDS = 12;
/**
 * Короче — совпадение может быть случайным («да да да»): такой повтор
 * убирается, только если это весь текст справа и он же — конец текста слева.
 */
export const JOINT_MIN_MATCH_WORDS = 4;
/** Первые слова куска бывают обрезаны посреди слова — до двух пропускаем. */
const HEAD_SKIP_WORDS = 2;
/** Слов в секунду речи с запасом: сколько хвоста слева может повториться. */
const WORDS_PER_SEC = 4;
const MAX_TAIL_WORDS = 80;

/** Позиция на стыке: с какого слова хвоста слева начинается повтор и с какого слова справа продолжать. */
export interface JointMatch {
    tailFrom: number;
    headFrom: number;
}

export interface JointOptions {
    /** Оба куска с таймкодами: сравниваются только сегменты, пересекающиеся по времени. */
    bothTimed: boolean;
    /** Нахлёст кусков, секунд; нет нахлёста — нет и повтора. */
    overlapSec: number;
}

export interface JointResult {
    left: TranscriptSegment[];
    right: TranscriptSegment[];
}

/** Слово сегмента: номер сегмента, номер слова в нём и форма для сравнения. */
interface WordRef {
    piece: number;
    word: number;
    norm: string;
}

const wordsOf = (text: string): string[] =>
    text.split(/\s+/).filter(word => word !== '');

export const normalizeWord = (word: string): string =>
    word
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^\p{L}\p{N}]+/gu, '');

function lastIndexOfRun(
    tail: readonly string[],
    head: readonly string[],
    skip: number,
    length: number,
): number {
    for (let at = tail.length - length; at >= 0; at--) {
        let same = true;
        for (let index = 0; index < length && same; index++) {
            same = tail[at + index] === head[skip + index];
        }
        if (same) return at;
    }
    return -1;
}

/**
 * Где в хвосте слева начинается то, с чего начинается текст справа
 * (слова уже приведены к форме для сравнения). Сначала самые длинные
 * совпадения, до {@link JOINT_MAX_MATCH_WORDS} слов; при равной длине —
 * ближайшее к концу хвоста. null — повтора не видно.
 */
export function findRepeatedJoint(
    tail: readonly string[],
    head: readonly string[],
): JointMatch | null {
    for (
        let length = Math.min(JOINT_MAX_MATCH_WORDS, head.length);
        length > 0;
        length--
    ) {
        if (length < JOINT_MIN_MATCH_WORDS) {
            const whole =
                length === head.length &&
                tail.length >= length &&
                lastIndexOfRun(tail, head, 0, length) === tail.length - length;
            if (whole) return { tailFrom: tail.length - length, headFrom: 0 };
            continue;
        }
        for (
            let skip = 0;
            skip <= HEAD_SKIP_WORDS && skip + length <= head.length;
            skip++
        ) {
            const at = lastIndexOfRun(tail, head, skip, length);
            if (at >= 0) return { tailFrom: at, headFrom: skip };
        }
    }
    return null;
}

/** Слова сегментов `pieces` (по номерам) в порядке текста. */
function refsOf(
    segments: readonly TranscriptSegment[],
    pieces: readonly number[],
): WordRef[] {
    return pieces.flatMap(piece =>
        wordsOf(segments[piece].text)
            .map((word, index) => ({
                piece,
                word: index,
                norm: normalizeWord(word),
            }))
            .filter(ref => ref.norm !== ''),
    );
}

/** Номера последних сегментов слева, в которых наберётся `words` слов. */
function lastPieces(
    segments: readonly TranscriptSegment[],
    words: number,
): number[] {
    const pieces: number[] = [];
    let count = 0;
    for (
        let piece = segments.length - 1;
        piece >= 0 && count < words;
        piece--
    ) {
        pieces.unshift(piece);
        count += wordsOf(segments[piece].text).length;
    }
    return pieces;
}

const tailWindow = (overlapSec: number): number =>
    Math.min(
        MAX_TAIL_WORDS,
        Math.max(
            JOINT_MAX_MATCH_WORDS + HEAD_SKIP_WORDS,
            Math.ceil(overlapSec * WORDS_PER_SEC) + 5,
        ),
    );

/** Слева — всё до слова `ref` (сегменты после него уходят). */
function cutBefore(
    segments: readonly TranscriptSegment[],
    ref: WordRef,
): TranscriptSegment[] {
    const kept = wordsOf(segments[ref.piece].text).slice(0, ref.word);
    const head = segments.slice(0, ref.piece);
    return kept.length
        ? [...head, { ...segments[ref.piece], text: kept.join(' ') }]
        : head;
}

/** Справа — всё начиная со слова `ref`. */
function keepFrom(
    segments: readonly TranscriptSegment[],
    ref: WordRef,
): TranscriptSegment[] {
    const kept = wordsOf(segments[ref.piece].text).slice(ref.word);
    return [
        { ...segments[ref.piece], text: kept.join(' ') },
        ...segments.slice(ref.piece + 1),
    ];
}

/** Сегменты слева, конец которых заходит за начало первого справа. */
function overlappingTail(
    left: readonly TranscriptSegment[],
    rightStart: number,
): number[] {
    const pieces: number[] = [];
    for (let piece = left.length - 1; piece >= 0; piece--) {
        if (left[piece].endSec <= rightStart) break;
        pieces.unshift(piece);
    }
    return pieces;
}

/** Сегменты справа, начало которых раньше конца последнего слева. */
function overlappingHead(
    right: readonly TranscriptSegment[],
    leftEnd: number,
): number[] {
    const pieces: number[] = [];
    for (let piece = 0; piece < right.length; piece++) {
        if (right[piece].startSec >= leftEnd) break;
        pieces.push(piece);
    }
    return pieces;
}

/**
 * Убрать повтор на стыке: слева отрезается хвост, который повторяет
 * начало правого куска, справа — обрезанные первые слова. Правый кусок
 * остаётся целым: его начало — середина записи, а не обрезанный край.
 */
export function trimJointRepeat(
    left: readonly TranscriptSegment[],
    right: readonly TranscriptSegment[],
    options: JointOptions,
): JointResult {
    const unchanged = { left: [...left], right: [...right] };
    if (!left.length || !right.length || options.overlapSec <= 0) {
        return unchanged;
    }
    const window = tailWindow(options.overlapSec);
    const tailPieces = options.bothTimed
        ? overlappingTail(left, right[0].startSec)
        : lastPieces(left, window);
    const headPieces = options.bothTimed
        ? overlappingHead(right, left[left.length - 1].endSec)
        : right.map((_segment, piece) => piece);
    const tail = refsOf(left, tailPieces).slice(-window);
    const head = refsOf(right, headPieces).slice(
        0,
        HEAD_SKIP_WORDS + JOINT_MAX_MATCH_WORDS,
    );
    const match = findRepeatedJoint(
        tail.map(ref => ref.norm),
        head.map(ref => ref.norm),
    );
    if (!match) return unchanged;
    return {
        left: cutBefore(left, tail[match.tailFrom]),
        right: keepFrom(right, head[match.headFrom]),
    };
}
