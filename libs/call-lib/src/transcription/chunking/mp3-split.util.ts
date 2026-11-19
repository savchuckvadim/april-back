/**
 * Резка MP3 на куски по кадрам (см. mp3-frames.util): кусок — непрерывный
 * ряд целых кадров, соседние куски перекрываются. Без перекодирования.
 *
 * Чистые функции: без DI и сети.
 */
import { scanMp3Frames, type Mp3FrameMap } from './mp3-frames.util';

export interface Mp3Chunk {
    index: number;
    /** Начало куска от начала записи, секунд (граница кадра). */
    startSec: number;
    endSec: number;
    buffer: Buffer;
}

export interface SplitMp3Options {
    /** Длина куска без нахлёста, секунд. */
    chunkSec: number;
    /** Нахлёст соседних кусков, секунд (меньше половины куска). */
    overlapSec: number;
}

/** Кусок кадров [from, to). */
export interface FrameRange {
    from: number;
    to: number;
}

/** Запас на погрешность деления секунд на длительность кадра. */
const EPS = 1e-9;

/**
 * Кадры кусков: кусок `i` начинается с кадра, в который попала секунда
 * `i × chunkSec`, и заканчивается кадром, в который попала секунда
 * `(i + 1) × chunkSec + overlapSec` (у последнего — конец записи). Хвост
 * короче трети куска приклеивается к предыдущему куску.
 */
export function chunkFrameRanges(
    frameCount: number,
    frameSec: number,
    { chunkSec, overlapSec }: SplitMp3Options,
): FrameRange[] {
    const totalSec = frameCount * frameSec;
    let count = Math.max(1, Math.ceil(totalSec / chunkSec - EPS));
    if (count > 1 && totalSec - (count - 1) * chunkSec < chunkSec / 3) {
        count -= 1;
    }
    const ranges: FrameRange[] = [];
    for (let index = 0; index < count; index++) {
        const from = Math.floor((index * chunkSec) / frameSec + EPS);
        const to =
            index === count - 1
                ? frameCount
                : Math.min(
                      frameCount,
                      Math.ceil(
                          ((index + 1) * chunkSec + overlapSec) / frameSec -
                              EPS,
                      ),
                  );
        ranges.push({ from, to });
    }
    return ranges;
}

/** Байты кадров [from, to): подряд идущие — одним срезом без копии. */
function frameBytes(
    buffer: Buffer,
    map: Mp3FrameMap,
    range: FrameRange,
): Buffer {
    const runs: Buffer[] = [];
    let runStart = map.offsets[range.from];
    let runEnd = runStart;
    for (let frame = range.from; frame < range.to; frame++) {
        if (map.offsets[frame] !== runEnd) {
            runs.push(buffer.subarray(runStart, runEnd));
            runStart = map.offsets[frame];
        }
        runEnd = map.offsets[frame] + map.lengths[frame];
    }
    runs.push(buffer.subarray(runStart, runEnd));
    return runs.length === 1 ? runs[0] : Buffer.concat(runs);
}

const roundMs = (sec: number): number => Math.round(sec * 1000) / 1000;

/**
 * Запись → куски по `chunkSec` с нахлёстом `overlapSec`, режутся только
 * между кадрами. null — не MP3 или битый поток: звонок распознаётся
 * целиком, как раньше. Неверные параметры — ошибка вызывающего.
 */
export function splitMp3(
    buffer: Buffer,
    options: SplitMp3Options,
): Mp3Chunk[] | null {
    const { chunkSec, overlapSec } = options;
    if (!(chunkSec > 0) || !(overlapSec >= 0) || overlapSec * 2 >= chunkSec) {
        throw new RangeError(
            `Резка MP3: нужен кусок > 0 и нахлёст меньше половины куска (кусок ${chunkSec} с, нахлёст ${overlapSec} с)`,
        );
    }
    const map = scanMp3Frames(buffer);
    if (!map) return null;
    return chunkFrameRanges(map.offsets.length, map.frameSec, options).map(
        (range, index) => ({
            index,
            startSec: roundMs(range.from * map.frameSec),
            endSec: roundMs(range.to * map.frameSec),
            buffer: frameBytes(buffer, map, range),
        }),
    );
}
