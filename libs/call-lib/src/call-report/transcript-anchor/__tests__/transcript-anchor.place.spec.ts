import type { EvidenceNearRule } from '../transcript-anchor.evidence';
import { locateCheckedAnchor } from '../transcript-anchor.place';
import type { TranscriptAnchor } from '../transcript-anchor.types';
import { indexTranscript } from '../transcript-anchor.util';

/** Реплики по 10 секунд: 0–9, 10–19, … Запись — 50 секунд. */
const INDEX = indexTranscript(
    [
        'Добрый день, компания Гарант, меня зовут Ирина.',
        'Скажите, чем пользуетесь для поиска документов?',
        'Консультантом пользуемся, договор до декабря.',
        'Давайте покажу, как устроена проверка контрагентов.',
        'Хорошо, присылайте предложение на почту.',
    ].map((text, index) => ({
        index,
        startSec: index * 10,
        endSec: index * 10 + 9,
        text,
    })),
);
const DURATION = 50;
const RULE: EvidenceNearRule = {
    beforeSec: 20,
    afterSec: 20,
    minWordLetters: 4,
    minWordShare: 0.6,
};

const locate = (anchor: Partial<TranscriptAnchor>) =>
    locateCheckedAnchor(
        INDEX,
        { quote: null, startSec: null, endSec: null, ...anchor },
        DURATION,
        RULE,
    );

describe('проверенное место разбора для кнопки «Показать в разговоре»', () => {
    it('цитата нашлась — место по тексту, время модели не важно', () => {
        expect(locate({ quote: 'договор до декабря', startSec: 3 })).toEqual({
            segmentIndexes: [2],
            startSec: 20,
        });
        expect(locate({ quote: 'договор до декабря', startSec: 4000 })).toEqual(
            { segmentIndexes: [2], startSec: 20 },
        );
    });

    it('цитата не нашлась, слова рядом со временем — место по времени', () => {
        expect(
            locate({
                quote: 'пользуемся консультантом, а договор до декабря',
                startSec: 24,
            }),
        ).toEqual({ segmentIndexes: [2], startSec: 20 });
    });

    it('цитата не нашлась и слов рядом нет — места нет', () => {
        expect(
            locate({ quote: 'нам ничего не нужно, спасибо', startSec: 24 }),
        ).toBeNull();
        // Слова есть, но далеко от названного времени (дальше 20 с).
        expect(
            locate({
                quote: 'присылайте предложение на почту пожалуйста',
                startSec: 5,
            }),
        ).toBeNull();
    });

    it('время вне записи — неизвестно', () => {
        expect(
            locate({
                quote: 'пользуемся консультантом, а договор до декабря',
                startSec: 4000,
            }),
        ).toBeNull();
        expect(locate({ startSec: 4000 })).toBeNull();
        expect(locate({ startSec: -5 })).toBeNull();
    });

    it('без цитаты: время больше нуля и внутри записи, 0 и пусто — места нет', () => {
        expect(locate({ startSec: 33 })).toEqual({
            segmentIndexes: [3],
            startSec: 30,
        });
        expect(locate({ startSec: 0 })).toBeNull();
        expect(locate({})).toBeNull();
    });
});
