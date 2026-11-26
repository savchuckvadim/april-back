import {
    locatePartRanges,
    partsWithoutDigest,
} from '../long-call-input-parts.util';
import { prepareTranscript, rangeTexts } from '../long-call-input-lines.util';
import {
    digestOf,
    makeParts,
    timedLine,
    uniformLines,
} from './long-call-input.fixture';

describe('locatePartRanges — где части лежат в строках записи', () => {
    const text = uniformLines(100).join('\n');
    const prepared = prepareTranscript(text);
    const parts = makeParts(text, []);

    it('строки диапазона каждой части совпадают с текстом части', () => {
        const ranges = locatePartRanges(prepared, parts);

        expect(parts.length).toBeGreaterThan(2);
        for (const { part } of parts) {
            const range = ranges.get(part.number);
            expect(range).toBeDefined();
            expect(rangeTexts(prepared, range!).join('\n')).toBe(part.text);
        }
    });

    it('части идут вперёд и перекрываются: следующая начинается внутри предыдущей', () => {
        const ranges = locatePartRanges(prepared, parts);

        for (let index = 1; index < parts.length; index++) {
            const previous = ranges.get(parts[index - 1].part.number)!;
            const current = ranges.get(parts[index].part.number)!;
            expect(current.from).toBeGreaterThan(previous.from);
            expect(current.from).toBeLessThanOrEqual(previous.to);
        }
    });

    it('повторяющиеся строки не сбивают поиск: совпадать должна вся часть', () => {
        const repeating = [
            '[00:00] да',
            '[00:10] нет',
            '[00:20] да',
            '[00:30] нет',
        ];
        const result = locatePartRanges(
            prepareTranscript(repeating.join('\n')),
            [
                {
                    part: {
                        number: 1,
                        total: 1,
                        text: '[00:20] да\n[00:30] нет',
                        fromSec: 20,
                        toSec: 30,
                    },
                    digest: null,
                },
            ],
        );

        expect(result.get(1)).toEqual({ from: 2, to: 3 });
    });

    it('части, которой нет в записи, в результате нет', () => {
        const foreign = makeParts(uniformLines(5).join('\n'), []);
        const other = prepareTranscript(
            [timedLine(0, 'чужая'), timedLine(10, 'запись')].join('\n'),
        );

        expect(locatePartRanges(other, foreign).size).toBe(0);
    });
});

describe('partsWithoutDigest — части без конспекта как отрывки', () => {
    const text = uniformLines(100).join('\n');
    const prepared = prepareTranscript(text);

    it('кандидат только у части без конспекта: диапазон, подпись и время части', () => {
        const parts = makeParts(text, [
            digestOf(),
            null,
            digestOf(),
            digestOf(),
        ]);
        expect(parts).toHaveLength(4);
        const candidates = partsWithoutDigest(
            parts,
            locatePartRanges(prepared, parts),
        );

        expect(candidates).toHaveLength(1);
        const [candidate] = candidates;
        expect(candidate.source).toBe('part');
        expect(candidate.reason).toBe('часть 2, конспекта нет');
        expect(candidate.heading).toBe('часть 2, конспекта нет');
        expect(candidate.span).toEqual({
            fromSec: parts[1].part.fromSec,
            toSec: parts[1].part.toSec,
        });
        expect(rangeTexts(prepared, candidate.range).join('\n')).toBe(
            parts[1].part.text,
        );
    });

    it('все конспекты есть — кандидатов нет', () => {
        const parts = makeParts(text, []).map(({ part }) => ({
            part,
            digest: digestOf(),
        }));

        expect(
            partsWithoutDigest(parts, locatePartRanges(prepared, parts)),
        ).toEqual([]);
    });

    it('у записи без меток времени у части нет границ по времени', () => {
        const plain = Array.from(
            { length: 120 },
            (_, index) => `Реплика номер ${index} про задачу и систему.`,
        ).join('\n');
        const parts = makeParts(plain, []);
        const candidates = partsWithoutDigest(
            parts,
            locatePartRanges(prepareTranscript(plain), parts),
        );

        expect(candidates.length).toBe(parts.length);
        expect(candidates.every(candidate => candidate.span === null)).toBe(
            true,
        );
    });
});
