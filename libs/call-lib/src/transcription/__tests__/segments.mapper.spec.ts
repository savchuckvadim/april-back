import {
    SEGMENT_PAUSE_SEC,
    whisperSegmentsOf,
    wordsToSegments,
    yandexSecondsOf,
    yandexWordsOf,
    type TimedWord,
} from '../lib/segments.mapper';
import {
    formatTimecode,
    isTimecodeWithinDuration,
    parseTranscriptSegments,
    renderTranscriptWithTimecodes,
} from '../types/transcript-segment.types';

/**
 * Сегменты транскрипции (Фаза 3, П6): слова Yandex режутся по паузе и
 * каналу, сегменты Whisper переводятся в контракт, JSON-колонка читается
 * структурно, расшифровка для модели несёт метки [mm:ss].
 */
const word = (
    text: string,
    startSec: number,
    endSec: number,
    channel: string | null = null,
): TimedWord => ({ word: text, startSec, endSec, channel });

describe('wordsToSegments — слова → сегменты', () => {
    it('пауза длиннее порога начинает новый сегмент; текст склеивается пробелами', () => {
        const segments = wordsToSegments([
            word('Добрый', 0.5, 0.9),
            word('день', 1.0, 1.3),
            word('Слушаю', 3.2, 3.6),
        ]);

        expect(segments).toEqual([
            {
                startSec: 0.5,
                endSec: 1.3,
                speaker: 'unknown',
                text: 'Добрый день',
            },
            { startSec: 3.2, endSec: 3.6, speaker: 'unknown', text: 'Слушаю' },
        ]);
        expect(SEGMENT_PAUSE_SEC).toBe(1.5);
    });

    it('смена канала режет сегмент даже без паузы; карта каналов даёт говорящих', () => {
        const segments = wordsToSegments(
            [
                word('Здравствуйте', 0, 0.8, '1'),
                word('Да', 0.9, 1.1, '2'),
                word('слушаю', 1.2, 1.5, '2'),
            ],
            { speakers: { '1': 'manager', '2': 'client' } },
        );

        expect(
            segments.map(segment => [segment.speaker, segment.text]),
        ).toEqual([
            ['manager', 'Здравствуйте'],
            ['client', 'Да слушаю'],
        ]);
    });

    it('слова сортируются по времени, пустой вход — пустой список', () => {
        expect(
            wordsToSegments([word('два', 2, 2.4), word('раз', 1, 1.4)])[0].text,
        ).toBe('раз два');
        expect(wordsToSegments([])).toEqual([]);
    });
});

describe('yandexWordsOf / yandexSecondsOf — ответ longRunningRecognize', () => {
    it('строки длительности «1.5s» → секунды; чужие значения → null', () => {
        expect(yandexSecondsOf('1.879999999s')).toBeCloseTo(1.88, 2);
        expect(yandexSecondsOf(2)).toBe(2);
        expect(yandexSecondsOf('нет')).toBeNull();
        expect(yandexSecondsOf(null)).toBeNull();
    });

    it('слова первой альтернативы каждого чанка с номером канала', () => {
        const words = yandexWordsOf([
            {
                channelTag: '1',
                alternatives: [
                    {
                        text: 'Добрый день',
                        words: [
                            {
                                word: 'Добрый',
                                startTime: '0.5s',
                                endTime: '0.9s',
                            },
                            { word: 'день', startTime: '1s', endTime: '1.3s' },
                            { word: 'мусор', startTime: 'x' },
                        ],
                    },
                ],
            },
            'чужой чанк',
        ]);

        expect(words).toEqual([
            { word: 'Добрый', startSec: 0.5, endSec: 0.9, channel: '1' },
            { word: 'день', startSec: 1, endSec: 1.3, channel: '1' },
        ]);
        expect(yandexWordsOf(undefined)).toEqual([]);
    });
});

describe('whisperSegmentsOf — verbose_json', () => {
    it('start/end/text → контракт; пустой текст и чужая форма отбрасываются', () => {
        expect(
            whisperSegmentsOf([
                { start: 0, end: 2.345, text: ' Добрый день ' },
                { start: 3, end: 2, text: 'конец раньше начала' },
                { start: 4, end: 5, text: '   ' },
                null,
            ]),
        ).toEqual([
            {
                startSec: 0,
                endSec: 2.35,
                speaker: 'unknown',
                text: 'Добрый день',
            },
            {
                startSec: 3,
                endSec: 3,
                speaker: 'unknown',
                text: 'конец раньше начала',
            },
        ]);
        expect(whisperSegmentsOf('нет')).toEqual([]);
    });
});

describe('контракт сегментов', () => {
    it('parseTranscriptSegments: не массив → null, битые записи выпадают', () => {
        expect(parseTranscriptSegments(null)).toBeNull();
        expect(parseTranscriptSegments('x')).toBeNull();
        expect(
            parseTranscriptSegments([
                { startSec: 1, endSec: 2, speaker: 'client', text: 'а' },
                { startSec: 5, endSec: 2, text: 'конец раньше' },
                { startSec: 1, endSec: 2, speaker: 'робот', text: 'б' },
                { startSec: -1, endSec: 2, text: 'в' },
            ]),
        ).toEqual([
            { startSec: 1, endSec: 2, speaker: 'client', text: 'а' },
            { startSec: 1, endSec: 2, speaker: 'unknown', text: 'б' },
        ]);
    });

    it('formatTimecode и расшифровка с метками для модели', () => {
        expect(formatTimecode(0)).toBe('00:00');
        expect(formatTimecode(134.6)).toBe('02:15');
        expect(formatTimecode(3903)).toBe('65:03');
        expect(
            renderTranscriptWithTimecodes([
                { startSec: 0, endSec: 1, speaker: 'manager', text: 'Алло ' },
                {
                    startSec: 134,
                    endSec: 140,
                    speaker: 'unknown',
                    text: 'Дорого',
                },
            ]),
        ).toBe('[00:00] Менеджер: Алло\n[02:14] Дорого');
        expect(renderTranscriptWithTimecodes([])).toBe('');
    });

    it('isTimecodeWithinDuration: запас в секунду, без длительности — всегда да', () => {
        expect(isTimecodeWithinDuration(120, 120)).toBe(true);
        expect(isTimecodeWithinDuration(121, 120)).toBe(true);
        expect(isTimecodeWithinDuration(122, 120)).toBe(false);
        expect(isTimecodeWithinDuration(-1, 120)).toBe(false);
        expect(isTimecodeWithinDuration(999, null)).toBe(true);
    });
});
