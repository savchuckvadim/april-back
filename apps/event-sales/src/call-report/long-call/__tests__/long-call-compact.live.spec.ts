import { LONG_CALL_COMPACT_LIMITS } from '../long-call.const';
import { compactTranscript } from '../long-call-compact.util';
import {
    SPEAKER_BLOCK_SEGMENTS,
    linesOf,
    shortLinesTranscript,
    textOf,
    wordsOf,
} from './long-call-short-lines.fixture';

const { maxSpanSec, maxTextChars } = LONG_CALL_COMPACT_LIMITS;
const join = (...lines: string[]): string => lines.join('\n');

describe('compactTranscript — слова и повторный вызов', () => {
    const source = shortLinesTranscript(500);

    it('слова и их порядок сохранены (без меток и подписей)', () => {
        const compact = compactTranscript(source);

        expect(wordsOf(compact)).toEqual(wordsOf(source));
    });

    it('повторный вызов на своём результате: все слова на месте, строк не больше', () => {
        const once = compactTranscript(source);
        const twice = compactTranscript(once);

        expect(wordsOf(twice)).toEqual(wordsOf(source));
        expect(linesOf(twice).length).toBeLessThanOrEqual(linesOf(once).length);
    });

    it('смесь строк с метками и без: слова и порядок целы', () => {
        const mixed = join(
            '[00:00] Менеджер: раз',
            'без метки один',
            '[00:01] Менеджер: два',
            '[00:02] Клиент: три',
            '[00:09] Клиент: четыре',
            'без метки два',
            '[00:09] Клиент: пять',
        );

        expect(wordsOf(compactTranscript(mixed))).toEqual(wordsOf(mixed));
    });
});

describe('compactTranscript — «живой» пример: 6 000 строк по два слова, шаг полсекунды', () => {
    const SEGMENTS = 6_000;
    const SEC_PER_SEGMENT = 0.5;
    const source = shortLinesTranscript(SEGMENTS);
    const compact = compactTranscript(source);

    it('исходник — по строке на сегмент, говорящие чередуются блоками', () => {
        expect(linesOf(source)).toHaveLength(SEGMENTS);
        expect(linesOf(source)[0]).toContain('Менеджер:');
        expect(linesOf(source)[SPEAKER_BLOCK_SEGMENTS]).toContain('Клиент:');
    });

    it('строк меньше в несколько раз, текст короче исходника не меньше чем на 40 %', () => {
        expect(linesOf(compact).length * 5).toBeLessThanOrEqual(SEGMENTS);
        expect(compact.length).toBeLessThanOrEqual(source.length * 0.6);
    });

    it('все слова на месте и в том же порядке', () => {
        expect(wordsOf(compact)).toEqual(wordsOf(source));
    });

    it('каждая строка укладывается в пределы: текст до 240 знаков, по времени до 10 секунд', () => {
        for (const line of linesOf(compact)) {
            expect(textOf(line).length).toBeLessThanOrEqual(maxTextChars);
            const indexes = [...line.matchAll(/слово(\d+)/g)].map(match =>
                Number(match[1]),
            );
            const spanSec =
                (Math.max(...indexes) - Math.min(...indexes)) * SEC_PER_SEGMENT;
            expect(spanSec).toBeLessThanOrEqual(maxSpanSec + SEC_PER_SEGMENT);
        }
    });

    it('граница говорящих не размыта: в каждой строке один говорящий', () => {
        for (const line of linesOf(compact)) {
            const speakers = line.match(/(Менеджер|Клиент):/g) ?? [];
            expect(speakers).toHaveLength(1);
        }
    });
});
