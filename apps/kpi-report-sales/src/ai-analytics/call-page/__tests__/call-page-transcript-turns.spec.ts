import type { TranscriptSegment, TranscriptSpeaker } from '@lib/call-lib';
import { buildCallPageTranscript } from '../call-page-transcript.util';

/** Пословная расшифровка: слово 0,25 с, следующее — через `stepSec`. */
const words = (
    text: string,
    fromSec: number,
    speaker: TranscriptSpeaker = 'unknown',
    stepSec = 0.3,
): TranscriptSegment[] =>
    text.split(' ').map((word, position) => ({
        startSec: fromSec + position * stepSec,
        endSec: fromSec + position * stepSec + 0.25,
        speaker,
        text: word,
    }));

/** Каждое слово дважды подряд — два одинаковых канала стерео. */
const doubled = (segments: readonly TranscriptSegment[]): TranscriptSegment[] =>
    segments.flatMap(segment => [segment, { ...segment }]);

const shown = (segments: readonly TranscriptSegment[]) =>
    buildCallPageTranscript({ segments, text: null }, []).segments;

const texts = (segments: readonly TranscriptSegment[]): string[] =>
    shown(segments).map(segment => segment.text);

describe('расшифровка страницы звонка: пословная → реплики', () => {
    it('слова с короткими паузами — одна реплика, длинная пауза — новая', () => {
        const segments = shown([
            ...words('добрый день меня зовут ирина', 0),
            ...words('слушаю вас внимательно', 5),
        ]);

        expect(
            segments.map(segment => [
                segment.index,
                segment.speaker,
                segment.text,
            ]),
        ).toEqual([
            [0, null, 'добрый день меня зовут ирина'],
            [1, null, 'слушаю вас внимательно'],
        ]);
        // Время реплики — от первого слова до последнего.
        expect(segments[0]?.startSec).toBe(0);
        expect(segments[0]?.endSec).toBeCloseTo(1.45);
        expect(segments[1]?.startSec).toBe(5);
        expect(segments[1]?.endSec).toBeCloseTo(5.85);
    });

    it('смена говорящего — новая реплика, номера заново по порядку', () => {
        const segments = shown([
            ...words('алло добрый день', 0, 'manager'),
            ...words('да слушаю', 0.9, 'client'),
        ]);

        expect(
            segments.map(segment => [
                segment.index,
                segment.speaker,
                segment.text,
            ]),
        ).toEqual([
            [0, 'manager', 'алло добрый день'],
            [1, 'client', 'да слушаю'],
        ]);
    });

    it('конец предложения — граница реплики', () => {
        expect(texts(words('спасибо. до свидания', 0))).toEqual([
            'спасибо.',
            'до свидания',
        ]);
    });

    it('реплика не длиннее 25 слов и 15 секунд', () => {
        const thirty = Array.from({ length: 30 }, (_, n) => `слово${n}`);
        expect(
            texts(words(thirty.join(' '), 0)).map(
                text => text.split(' ').length,
            ),
        ).toEqual([25, 5]);

        const slow = Array.from({ length: 20 }, (_, n) => `шаг${n}`);
        const replicas = shown(words(slow.join(' '), 0, 'unknown', 1));
        expect(replicas.map(item => item.text.split(' ').length)).toEqual([
            15, 5,
        ]);
        expect(replicas[0]).toMatchObject({ startSec: 0, endSec: 14.25 });
    });

    it('фразовые сегменты не склеиваются', () => {
        const phrases: TranscriptSegment[] = [
            'Добрый день, компания Гарант, меня зовут Ирина',
            'Здравствуйте, слушаю вас внимательно',
            'Скажите, чем пользуетесь для поиска документов',
        ].map((text, position) => ({
            startSec: position * 3,
            endSec: position * 3 + 2.5,
            speaker: 'unknown',
            text,
        }));

        expect(shown(phrases)).toEqual(
            phrases.map((phrase, index) => ({
                index,
                startSec: phrase.startSec,
                endSec: phrase.endSec,
                speaker: null,
                text: phrase.text,
            })),
        );
    });
});

describe('расшифровка страницы звонка: повторы каналов стерео', () => {
    it('пары одинаковых слов — одно слово в реплике', () => {
        expect(
            texts(doubled(words('да татьяна викторовна слушаю', 3))),
        ).toEqual(['да татьяна викторовна слушаю']);
    });

    it('каналы чередуются (а, б, а′, б′) — повторы тоже убираются', () => {
        const [first, second] = words('добрый день', 0);
        expect(texts([first, second, { ...first }, { ...second }])).toEqual([
            'добрый день',
        ]);
    });

    it('у повторов разные говорящие — у оставшегося говорящий неизвестен', () => {
        const segments = shown([
            { startSec: 0, endSec: 2, speaker: 'manager', text: 'Алло' },
            { startSec: 0, endSec: 2.02, speaker: 'client', text: 'алло ' },
        ]);

        expect(segments).toEqual([
            { index: 0, startSec: 0, endSec: 2, speaker: null, text: 'Алло' },
        ]);
    });

    it('разные слова в одно время и одно слово в другое время не трогаются', () => {
        expect(
            texts([
                { startSec: 0, endSec: 0.3, speaker: 'unknown', text: 'да' },
                { startSec: 0, endSec: 0.3, speaker: 'unknown', text: 'нет' },
                { startSec: 0.4, endSec: 0.7, speaker: 'unknown', text: 'да' },
            ]),
        ).toEqual(['да нет да']);
    });
});
