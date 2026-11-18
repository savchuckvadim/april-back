import type { TranscriptSegment } from '../../../transcription/types/transcript-segment.types';
import {
    evidenceIndexOf,
    verifyEvidenceTime,
} from '../transcript-anchor.evidence';

/** Реплики по 10 секунд: 0–9, 10–19, … */
const segments = (texts: readonly string[]): TranscriptSegment[] =>
    texts.map((text, position) => ({
        startSec: position * 10,
        endSec: position * 10 + 9,
        speaker: 'unknown',
        text,
    }));

const CALL = segments([
    'Добрый день, компания Гарант, меня зовут Ирина.',
    'Здравствуйте, слушаю вас.',
    'Скажите, а какие задачи сейчас у вашей бухгалтерии?',
    'Ну, отчётность, НДС, проверяем контрагентов постоянно.',
    'Понимаю. А чем пользуетесь для поиска документов?',
    'Консультантом пользуемся, договор до декабря.',
    'Давайте покажу, как у нас устроена проверка контрагентов.',
]);
const INDEX = evidenceIndexOf(CALL);
const DURATION = 70;

describe('проверка секунды цитаты по расшифровке', () => {
    it('цитата нашлась — секунда реплики, даже если модель назвала другую', () => {
        expect(
            verifyEvidenceTime(
                INDEX,
                'какие задачи сейчас у вашей бухгалтерии',
                21,
                DURATION,
            ),
        ).toEqual({ startSec: 20, check: 'text', snapped: false });
        expect(
            verifyEvidenceTime(
                INDEX,
                'Консультантом пользуемся, договор до декабря',
                0,
                DURATION,
            ),
        ).toEqual({ startSec: 50, check: 'text', snapped: true });
    });

    it('цитата нашлась, а секунды не было — секунда реплики', () => {
        expect(
            verifyEvidenceTime(
                INDEX,
                'покажу, как у нас устроена',
                null,
                DURATION,
            ),
        ).toEqual({ startSec: 60, check: 'text', snapped: false });
    });

    it('пересказ, но его слова звучат рядом с секундой — секунда остаётся', () => {
        expect(
            verifyEvidenceTime(
                INDEX,
                'отчётность и НДС, постоянно проверяют контрагентов',
                30,
                DURATION,
            ),
        ).toEqual({ startSec: 30, check: 'near', snapped: false });
    });

    it('выдуманная цитата или слова далеко от секунды — места нет', () => {
        expect(
            verifyEvidenceTime(
                INDEX,
                'нас интересует электронная подпись для торгов',
                30,
                DURATION,
            ),
        ).toEqual({ startSec: null, check: 'dropped', snapped: false });
        expect(
            verifyEvidenceTime(
                INDEX,
                'Консультантом пользуются, договор действует до декабря',
                0,
                DURATION,
            ).check,
        ).toBe('dropped');
    });

    it('секунда за пределами записи — снимается', () => {
        expect(
            verifyEvidenceTime(
                INDEX,
                'электронная подпись для торгов',
                900,
                DURATION,
            ),
        ).toEqual({ startSec: null, check: 'dropped', snapped: false });
        expect(verifyEvidenceTime(INDEX, null, 900, DURATION).check).toBe(
            'dropped',
        );
    });

    it('без цитаты (или одно слово) — только «внутри записи»', () => {
        expect(verifyEvidenceTime(INDEX, null, 40, DURATION)).toEqual({
            startSec: 40,
            check: 'no_quote',
            snapped: false,
        });
        expect(verifyEvidenceTime(INDEX, 'НДС', 40, DURATION).check).toBe(
            'no_quote',
        );
    });

    it('реплик нет (старая расшифровка) — сверять не с чем, секунда внутри записи остаётся', () => {
        expect(evidenceIndexOf(null)).toBeNull();
        expect(evidenceIndexOf([])).toBeNull();
        expect(
            verifyEvidenceTime(
                null,
                'какие задачи у бухгалтерии',
                25,
                DURATION,
            ),
        ).toEqual({ startSec: 25, check: 'unchecked', snapped: false });
        expect(
            verifyEvidenceTime(
                null,
                'какие задачи у бухгалтерии',
                900,
                DURATION,
            ).check,
        ).toBe('dropped');
    });
});
