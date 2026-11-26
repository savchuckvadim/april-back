import {
    LONG_CALL_OVERLAP_CHARS,
    LONG_CALL_PART_CHARS,
    LONG_CALL_TAIL_SHARE,
    LONG_CALL_THRESHOLD_CHARS,
} from '../long-call.const';
import { isLongTranscript, splitTranscript } from '../long-call-split.util';
import {
    generateTranscriptLines,
    linesOf,
    stitchParts,
} from './long-call-transcript.fixture';

/** Пример «живого» размера: ~60 000 знаков, метки каждые 5–10 секунд. */
describe('splitTranscript — расшифровка живого размера', () => {
    const lines = generateTranscriptLines(60_000);
    const text = lines.join('\n');
    const options = {
        partChars: LONG_CALL_PART_CHARS,
        overlapChars: LONG_CALL_OVERLAP_CHARS,
    };
    const parts = splitTranscript(text, options);

    it('расшифровка около 60 000 знаков — длинная', () => {
        expect(text.length).toBeGreaterThanOrEqual(59_000);
        expect(text.length).toBeLessThan(61_000);
        expect(isLongTranscript(text, LONG_CALL_THRESHOLD_CHARS)).toBe(true);
    });

    it('получается от 6 до 8 частей, ни одна строка не потеряна, порядок сохранён', () => {
        expect(parts.length).toBeGreaterThanOrEqual(6);
        expect(parts.length).toBeLessThanOrEqual(8);
        expect(stitchParts(parts)).toEqual(lines);
    });

    it('часть не длиннее размера, а приклеенный хвост — не длиннее размера плюс треть', () => {
        const limit = LONG_CALL_PART_CHARS * (1 + LONG_CALL_TAIL_SHARE);
        for (const part of parts) {
            expect(part.text.length).toBeLessThanOrEqual(limit);
        }
        for (const part of parts.slice(0, -1)) {
            expect(part.text.length).toBeLessThanOrEqual(LONG_CALL_PART_CHARS);
        }
    });

    it('перекрытие соседних частей не больше 900 знаков', () => {
        for (let index = 1; index < parts.length; index++) {
            const previous = linesOf(parts[index - 1]);
            const current = linesOf(parts[index]);
            const repeated = current.filter(line => previous.includes(line));
            expect(repeated.join('\n').length).toBeLessThanOrEqual(
                LONG_CALL_OVERLAP_CHARS,
            );
            expect(repeated.length).toBeGreaterThan(0);
        }
    });

    it('время частей идёт вперёд, соседние части перекрываются по времени', () => {
        for (let index = 1; index < parts.length; index++) {
            const previous = parts[index - 1];
            const current = parts[index];
            expect(current.fromSec).not.toBeNull();
            expect(current.fromSec as number).toBeGreaterThan(
                previous.fromSec as number,
            );
            expect(current.fromSec as number).toBeLessThanOrEqual(
                previous.toSec as number,
            );
        }
        expect(parts[0].fromSec).toBeLessThanOrEqual(10);
    });

    it('номера частей идут подряд, число частей одно у всех', () => {
        expect(parts.map(part => part.number)).toEqual(
            parts.map((_, index) => index + 1),
        );
        expect(new Set(parts.map(part => part.total))).toEqual(
            new Set([parts.length]),
        );
    });
});
