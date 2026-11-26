import { LONG_CALL_TAIL_SHARE } from '../long-call.const';
import { isLongTranscript, splitTranscript } from '../long-call-split.util';
import { linesOf, stitchParts } from './long-call-transcript.fixture';

/** Строка из 15 знаков: `row-01-xxxxxxxx`. */
const row = (index: number): string =>
    `row-${String(index).padStart(2, '0')}-xxxxxxxx`;
const rows = (count: number): string[] =>
    Array.from({ length: count }, (_, index) => row(index + 1));

describe('isLongTranscript — порог длинного разговора', () => {
    it('длина считается без крайних пробелов; ровно порог — длинный', () => {
        expect(isLongTranscript('x'.repeat(100), 100)).toBe(true);
        expect(isLongTranscript('x'.repeat(99), 100)).toBe(false);
        expect(isLongTranscript(`  ${'x'.repeat(99)}\n  `, 100)).toBe(false);
        expect(isLongTranscript(`\n${'x'.repeat(100)} `, 100)).toBe(true);
    });

    it('пустой текст — не длинный', () => {
        expect(isLongTranscript('', 100)).toBe(false);
        expect(isLongTranscript('   ', 100)).toBe(false);
    });
});

describe('splitTranscript — резка по границам строк', () => {
    it('текст короче части — одна часть с исходным текстом и временем первой и последней метки', () => {
        const text = '[00:05] Менеджер: Алло\n[00:09] Клиент: Да';
        const parts = splitTranscript(text, {
            partChars: 1000,
            overlapChars: 100,
        });

        expect(parts).toEqual([
            { number: 1, total: 1, text, fromSec: 5, toSec: 9 },
        ]);
    });

    it('пустой текст — пустой список; размер части не больше нуля — ошибка', () => {
        expect(
            splitTranscript('', { partChars: 50, overlapChars: 10 }),
        ).toEqual([]);
        expect(
            splitTranscript(' \n \n', { partChars: 50, overlapChars: 10 }),
        ).toEqual([]);
        expect(() =>
            splitTranscript('текст', { partChars: 0, overlapChars: 0 }),
        ).toThrow(RangeError);
    });

    it('режем только по границам строк: ни одна строка не разорвана, части не длиннее размера', () => {
        const original = rows(9);
        const parts = splitTranscript(original.join('\n'), {
            partChars: 50,
            overlapChars: 16,
        });

        expect(parts.length).toBeGreaterThan(1);
        for (const part of parts) {
            expect(part.text.length).toBeLessThanOrEqual(50);
            for (const line of linesOf(part)) expect(original).toContain(line);
        }
    });

    it('номера частей идут с 1, общее число у всех одинаково', () => {
        const parts = splitTranscript(rows(9).join('\n'), {
            partChars: 50,
            overlapChars: 16,
        });

        expect(parts.map(part => part.number)).toEqual([1, 2, 3, 4]);
        expect(parts.every(part => part.total === 4)).toBe(true);
    });

    it('пустые строки и переводы \\r\\n не мешают', () => {
        const parts = splitTranscript('a\r\n\r\nb\n  \nc', {
            partChars: 100,
            overlapChars: 0,
        });

        expect(parts).toHaveLength(1);
        expect(parts[0].text).toBe('a\nb\nc');
    });
});

describe('splitTranscript — перекрытие', () => {
    it('следующая часть начинается с последней строки предыдущей, если она помещается в перекрытие', () => {
        const parts = splitTranscript(rows(9).join('\n'), {
            partChars: 50,
            overlapChars: 16,
        });

        for (let index = 1; index < parts.length; index++) {
            const previousLines = linesOf(parts[index - 1]);
            expect(linesOf(parts[index])[0]).toBe(
                previousLines[previousLines.length - 1],
            );
        }
    });

    it('берутся целые строки общей длиной не больше перекрытия: две строки при перекрытии 31', () => {
        const [first, second] = splitTranscript(rows(9).join('\n'), {
            partChars: 50,
            overlapChars: 31,
        });

        expect(linesOf(first)).toEqual(rows(3));
        expect(linesOf(second).slice(0, 2)).toEqual([row(2), row(3)]);
    });

    it('последняя строка длиннее перекрытия — перекрытия нет', () => {
        const parts = splitTranscript(rows(9).join('\n'), {
            partChars: 50,
            overlapChars: 10,
        });

        expect(linesOf(parts[0])).toEqual(rows(3));
        expect(linesOf(parts[1])[0]).toBe(row(4));
    });

    it('перекрытие урезается, если иначе следующая строка не влезла бы в часть', () => {
        const a = 'a'.repeat(20);
        const b = 'b'.repeat(20);
        const c = 'c'.repeat(45);
        const parts = splitTranscript([a, b, c].join('\n'), {
            partChars: 50,
            overlapChars: 31,
        });

        expect(parts.map(part => part.text)).toEqual([`${a}\n${b}`, c]);
    });

    it('склейка частей без перекрытий даёт исходные строки в исходном порядке', () => {
        const original = rows(40);
        for (const overlapChars of [0, 16, 31, 47]) {
            const parts = splitTranscript(original.join('\n'), {
                partChars: 50,
                overlapChars,
            });

            expect(stitchParts(parts)).toEqual(original);
        }
    });

    it('без перекрытия части просто идут друг за другом', () => {
        const parts = splitTranscript(rows(9).join('\n'), {
            partChars: 50,
            overlapChars: 0,
        });

        expect(parts.map(part => part.text).join('\n')).toBe(
            rows(9).join('\n'),
        );
    });
});

describe('splitTranscript — короткий хвост', () => {
    it('хвост короче трети части приклеивается к предыдущей части', () => {
        // 6 строк: части [1–3], [3–5], хвост из одной строки (15 < 50/3)
        const parts = splitTranscript(rows(6).join('\n'), {
            partChars: 50,
            overlapChars: 16,
        });

        expect(parts).toHaveLength(2);
        expect(linesOf(parts[1])).toEqual([row(3), row(4), row(5), row(6)]);
        expect(parts[1].total).toBe(2);
    });

    it('хвост не короче трети части остаётся своей частью', () => {
        // 7 строк: хвост из двух строк (31 ≥ 50/3)
        const parts = splitTranscript(rows(7).join('\n'), {
            partChars: 50,
            overlapChars: 16,
        });

        expect(parts).toHaveLength(3);
        expect(linesOf(parts[2])).toEqual([row(5), row(6), row(7)]);
    });

    it('доля хвоста — одна треть', () => {
        expect(LONG_CALL_TAIL_SHARE).toBeCloseTo(1 / 3);
    });
});
