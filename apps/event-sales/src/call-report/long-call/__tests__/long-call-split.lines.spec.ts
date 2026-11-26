import { LONG_CALL_TAIL_SHARE } from '../long-call.const';
import { splitTranscript } from '../long-call-split.util';
import { linesOf, stitchParts } from './long-call-transcript.fixture';

describe('splitTranscript — один абзац и длинные строки', () => {
    const SENTENCES = Array.from(
        { length: 60 },
        (_, index) =>
            `Предложение номер ${index} про систему и задачи клиента.`,
    );

    it('расшифровка без переводов строк делится на предложения, части не рвут их', () => {
        const parts = splitTranscript(SENTENCES.join(' '), {
            partChars: 1000,
            overlapChars: 100,
        });

        expect(parts.length).toBeGreaterThan(2);
        for (const part of parts) {
            expect(part.fromSec).toBeNull();
            expect(part.toSec).toBeNull();
            expect(part.text.length).toBeLessThanOrEqual(
                1000 * (1 + LONG_CALL_TAIL_SHARE),
            );
            for (const line of linesOf(part)) expect(SENTENCES).toContain(line);
        }
        expect(stitchParts(parts)).toEqual(SENTENCES);
    });

    it('границы предложений — «. », «? », «! » и «… »', () => {
        const sentences = [
            'Первое предложение идёт тут.',
            'Второе — вопрос какой-то?',
            'Третье — восклицание тоже!',
            'Четвёртое — многоточие…',
            'Пятое — последнее здесь.',
        ];
        const parts = splitTranscript(sentences.join(' '), {
            partChars: 60,
            overlapChars: 0,
        });

        expect(parts.length).toBeGreaterThan(1);
        expect(parts.flatMap(linesOf)).toEqual(sentences);
    });

    it('метка времени остаётся у первого куска длинной строки, у остальных её нет', () => {
        const parts = splitTranscript(`[00:05] ${SENTENCES.join(' ')}`, {
            partChars: 400,
            overlapChars: 0,
        });

        expect(parts[0].fromSec).toBe(5);
        expect(parts[0].toSec).toBe(5);
        expect(parts[1].fromSec).toBeNull();
        expect(parts[1].toSec).toBeNull();
    });

    it('строка длиннее части без предложений режется по знакам', () => {
        const line = 'x'.repeat(250);
        const parts = splitTranscript(line, {
            partChars: 100,
            overlapChars: 0,
        });

        expect(parts.map(part => part.text.length)).toEqual([100, 100, 50]);
        expect(parts.map(part => part.text).join('')).toBe(line);
    });

    it('предложение длиннее части внутри строки режется по знакам, остальные предложения целы', () => {
        const long = `${'y'.repeat(130)}.`;
        const parts = splitTranscript(`Короткое раз. ${long} Короткое два.`, {
            partChars: 100,
            overlapChars: 0,
        });

        const lines = parts.flatMap(linesOf);
        expect(lines).toContain('Короткое раз.');
        expect(lines).toContain('Короткое два.');
        expect(lines.filter(line => line.startsWith('y')).join('')).toBe(long);
        expect(lines.every(line => line.length <= 100)).toBe(true);
    });
});

describe('splitTranscript — время частей', () => {
    it('fromSec и toSec — секунды первой и последней метки части', () => {
        const lines = [
            '[00:10] aaaaaaaaaaaaaaaaaaaa',
            '[00:20] bbbbbbbbbbbbbbbbbbbb',
            '[00:30] cccccccccccccccccccc',
            '[00:40] dddddddddddddddddddd',
        ];
        const parts = splitTranscript(lines.join('\n'), {
            partChars: 60,
            overlapChars: 0,
        });

        expect(parts.map(part => [part.fromSec, part.toSec])).toEqual([
            [10, 20],
            [30, 40],
        ]);
    });

    it('в части нет меток — оба времени null; строки без метки внутри части не мешают', () => {
        const lines = [
            '[00:10] aaaaaaaaaaaaaaaaaaaa',
            'без метки bbbbbbbbbbbbbbbbbb',
            'без метки cccccccccccccccccc',
            'без метки dddddddddddddddddd',
            '[01:00] eeeeeeeeeeeeeeeeeeee',
        ];
        const parts = splitTranscript(lines.join('\n'), {
            partChars: 60,
            overlapChars: 0,
        });

        expect(parts.map(part => [part.fromSec, part.toSec])).toEqual([
            [10, 10],
            [null, null],
            [60, 60],
        ]);
    });

    it('минуты больше 59: метка 65:03 — это 3903 секунды, 125:03 — 7503', () => {
        const parts = splitTranscript(
            '[65:03] Менеджер: час уже прошёл\n[125:03] Клиент: две минуты сверху',
            { partChars: 1000, overlapChars: 0 },
        );

        expect(parts[0].fromSec).toBe(3903);
        expect(parts[0].toSec).toBe(7503);
    });
});
