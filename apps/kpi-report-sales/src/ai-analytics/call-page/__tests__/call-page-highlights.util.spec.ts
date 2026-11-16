import {
    indexTranscript,
    matchAnchor,
    wordsOf,
} from '../call-page-highlights.util';
import type { CallPageAnchor, CallPageSegmentView } from '../call-page.types';

const timed = (texts: readonly string[]): CallPageSegmentView[] =>
    texts.map((text, index) => ({
        index,
        startSec: index * 10,
        endSec: index * 10 + 9,
        speaker: null,
        text,
    }));

const untimed = (texts: readonly string[]): CallPageSegmentView[] =>
    texts.map((text, index) => ({
        index,
        startSec: null,
        endSec: null,
        speaker: null,
        text,
    }));

const anchor = (fields: Partial<CallPageAnchor>): CallPageAnchor => ({
    quote: null,
    startSec: null,
    endSec: null,
    ...fields,
});

const CALL = [
    'Добрый день, компания Гарант, меня зовут Ирина.',
    'Здравствуйте, слушаю вас.',
    'Хотела предложить вам посмотреть нашу систему.',
    'Нет, спасибо, у нас уже всё есть, и это дорого.',
    'Понимаю. А какой системой вы пользуетесь сейчас?',
    'Ну, пользуемся Консультантом, нам хватает.',
    'Давайте я покажу, чем мы отличаемся, это дорого не будет.',
];

describe('привязка места разбора к репликам расшифровки', () => {
    it('слова: без регистра, знаков и «ё»', () => {
        expect(wordsOf('Ещё раз: «Дорого!» — 120 000 ₽')).toEqual([
            'еще',
            'раз',
            'дорого',
            '120',
            '000',
        ]);
    });

    it('дословная цитата находит свою реплику и её время', () => {
        const match = matchAnchor(
            indexTranscript(timed(CALL)),
            anchor({ quote: 'у нас уже всё есть' }),
        );
        expect(match).toEqual({ segmentIndexes: [3], startSec: 30 });
    });

    it('цитата на стыке реплик подсвечивает обе', () => {
        const match = matchAnchor(
            indexTranscript(timed(CALL)),
            anchor({ quote: 'это дорого. Понимаю, а какой системой' }),
        );
        expect(match.segmentIndexes).toEqual([3, 4]);
    });

    it('из нескольких совпадений берётся ближайшее к названному времени', () => {
        const index = indexTranscript(timed(CALL));
        expect(
            matchAnchor(index, anchor({ quote: 'это дорого' })).segmentIndexes,
        ).toEqual([3]);
        expect(
            matchAnchor(index, anchor({ quote: 'это дорого', startSec: 62 }))
                .segmentIndexes,
        ).toEqual([6]);
    });

    it('цитата с пропуском ищется по частям', () => {
        const match = matchAnchor(
            indexTranscript(timed(CALL)),
            anchor({ quote: 'у нас уже всё есть… пользуемся Консультантом' }),
        );
        expect(match.segmentIndexes).toEqual([3, 5]);
    });

    it('длинная цитата с расхождением в середине — по началу и концу', () => {
        const match = matchAnchor(
            indexTranscript(timed(CALL)),
            anchor({
                quote: 'Хотела предложить вам посмотреть систему Гарант. Нет, у нас уже всё есть',
            }),
        );
        expect(match.segmentIndexes).toEqual([2, 3]);
    });

    it('одно слово без времени не привязывается, рядом с временем — да', () => {
        const index = indexTranscript(timed(CALL));
        expect(
            matchAnchor(index, anchor({ quote: 'Дорого' })).segmentIndexes,
        ).toEqual([]);
        expect(
            matchAnchor(index, anchor({ quote: 'Дорого', startSec: 33 }))
                .segmentIndexes,
        ).toEqual([3]);
    });

    it('текста нет в расшифровке — реплики по времени', () => {
        const match = matchAnchor(
            indexTranscript(timed(CALL)),
            anchor({
                quote: 'этих слов в записи нет',
                startSec: 41,
                endSec: 55,
            }),
        );
        expect(match).toEqual({ segmentIndexes: [4, 5], startSec: 40 });
    });

    it('ни текста, ни времени — привязки нет', () => {
        const index = indexTranscript(timed(CALL));
        expect(matchAnchor(index, anchor({}))).toEqual({
            segmentIndexes: [],
            startSec: null,
        });
        expect(
            matchAnchor(index, anchor({ quote: 'этих слов в записи нет' })),
        ).toEqual({ segmentIndexes: [], startSec: null });
    });

    it('расшифровка без таймкодов: по тексту находит, время — из разбора', () => {
        const index = indexTranscript(untimed(CALL));
        expect(
            matchAnchor(
                index,
                anchor({ quote: 'пользуемся Консультантом', startSec: 52 }),
            ),
        ).toEqual({ segmentIndexes: [5], startSec: 52 });
        expect(
            matchAnchor(index, anchor({ quote: 'нет в записи', startSec: 52 })),
        ).toEqual({ segmentIndexes: [], startSec: 52 });
    });

    it('неверное время конца не подсвечивает весь разговор', () => {
        const long = timed(
            Array.from({ length: 40 }, (_, i) => `реплика ${i}`),
        );
        const match = matchAnchor(
            indexTranscript(long),
            anchor({ startSec: 0, endSec: 9999 }),
        );
        expect(match.segmentIndexes).toHaveLength(12);
    });
});
