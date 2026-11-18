import { Logger } from '@nestjs/common';
import type {
    IYAChanks,
    YandexTranscriptionDetailed,
} from '../services/streaming-transcription.service';
import type { TranscriptSegment } from '../types/transcript-segment.types';
import { timedWords, yandexChunk } from './stereo-chunks.fixture';
import { makeService, ok } from './streaming-transcription.fixture';

/**
 * Разбор результата Яндекса для стерео (gsr 18.11.2026): «двойное моно»
 * (оба канала — весь разговор) даёт одну копию текста и сегментов из
 * одного канала; раздельное стерео, эхо, короткие записи, моно и куски
 * без слов — как раньше: все куски, по времени первого слова.
 */
const MANAGER_HELLO =
    'добрый день меня зовут татьяна викторовна компания гарант звоню по поводу обновления вашей правовой системы';
const CLIENT_HELLO = 'да здравствуйте слушаю вас внимательно';
const MANAGER_ASK =
    'подскажите пожалуйста удобно ли вам сейчас говорить или лучше перезвонить позже';
const CLIENT_ANSWER =
    'сейчас удобно говорите только недолго у меня через десять минут совещание с директором по закупкам';

/** Реплики по времени: текст и начало, с. Паузы между ними длиннее 1,5 с. */
const CONVERSATION: readonly (readonly [string, number])[] = [
    [MANAGER_HELLO, 0],
    [CLIENT_HELLO, 8],
    [MANAGER_ASK, 12],
    [CLIENT_ANSWER, 18],
];
const WHOLE_TEXT = CONVERSATION.map(([text]) => text).join(' ');

/** Весь разговор в одном канале — по куску на реплику. */
const wholeTalk = (channel: string): IYAChanks[] =>
    CONVERSATION.map(([text, fromSec]) =>
        yandexChunk(timedWords(text, fromSec, channel)),
    );

const replicas = (segments: TranscriptSegment[]): [string, string][] =>
    segments.map(segment => [segment.speaker, segment.text]);

const wordCount = (segments: TranscriptSegment[]): number =>
    segments.reduce((count, item) => count + item.text.split(' ').length, 0);

const recognize = (
    chunks: IYAChanks[],
): Promise<YandexTranscriptionDetailed> => {
    global.fetch = jest
        .fn()
        .mockResolvedValue(
            ok({ done: true, response: { chunks } }),
        ) as unknown as typeof fetch;
    return makeService().getTranscriptionDetailed('op-1');
};

describe('StreamingTranscriptionService — стерео с одинаковыми каналами', () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('оба канала — весь разговор: в тексте и сегментах одна копия, в логе канал и доля', async () => {
        const result = await recognize([...wholeTalk('1'), ...wholeTalk('2')]);

        expect(result.text).toBe(WHOLE_TEXT);
        expect(replicas(result.segments)).toEqual(
            CONVERSATION.map(([text]) => ['unknown', text]),
        );
        expect(logSpy).toHaveBeenCalledWith(
            'Стерео с одинаковыми каналами: оставлен канал 1, совпало 100 % слов (операция op-1)',
        );
    });

    it('во втором канале слов больше — текст и сегменты из него', async () => {
        const tail = yandexChunk(timedWords('алло вы меня слышите', 40, '2'));

        const result = await recognize([
            ...wholeTalk('1'),
            ...wholeTalk('2'),
            tail,
        ]);

        expect(result.text).toBe(`${WHOLE_TEXT} алло вы меня слышите`);
        expect(result.segments.at(-1)?.text).toBe('алло вы меня слышите');
        expect(wordCount(result.segments)).toBe(
            WHOLE_TEXT.split(' ').length + 4,
        );
        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('оставлен канал 2'),
        );
    });

    it('раздельное стерео: оба канала остаются и выстраиваются по времени', async () => {
        const result = await recognize([
            yandexChunk(timedWords(MANAGER_HELLO, 0, '1')),
            yandexChunk(timedWords(MANAGER_ASK, 12, '1')),
            yandexChunk(timedWords(CLIENT_HELLO, 8, '2')),
            yandexChunk(timedWords(CLIENT_ANSWER, 18, '2')),
        ]);

        expect(result.text).toBe(WHOLE_TEXT);
        expect(replicas(result.segments)).toEqual(
            CONVERSATION.map(([text]) => ['unknown', text]),
        );
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('частичное эхо (≈30 % слов) — оба канала остаются', async () => {
        const managerHello = timedWords(MANAGER_HELLO, 0, '1');
        const echo = yandexChunk(
            managerHello.slice(0, 8).map(word => ({ ...word, channel: '2' })),
        );

        const result = await recognize([
            yandexChunk(managerHello),
            yandexChunk(timedWords(MANAGER_ASK, 12, '1')),
            echo,
            yandexChunk(timedWords(CLIENT_HELLO, 8, '2')),
            yandexChunk(timedWords(CLIENT_ANSWER, 18, '2')),
        ]);

        expect(result.text).toBe(
            [
                MANAGER_HELLO,
                managerHello
                    .slice(0, 8)
                    .map(word => word.word)
                    .join(' '),
                CLIENT_HELLO,
                MANAGER_ASK,
                CLIENT_ANSWER,
            ].join(' '),
        );
        expect(wordCount(result.segments)).toBe(
            WHOLE_TEXT.split(' ').length + 8,
        );
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('мало слов в каналах — решение не принимаем, обе копии как раньше', async () => {
        const result = await recognize([
            yandexChunk(timedWords(CLIENT_HELLO, 8, '1')),
            yandexChunk(timedWords(CLIENT_HELLO, 8, '2')),
        ]);

        expect(result.text).toBe(`${CLIENT_HELLO} ${CLIENT_HELLO}`);
        expect(wordCount(result.segments)).toBe(10);
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('моно — без изменений', async () => {
        const result = await recognize(wholeTalk('1'));

        expect(result.text).toBe(WHOLE_TEXT);
        expect(replicas(result.segments)).toEqual(
            CONVERSATION.map(([text]) => ['unknown', text]),
        );
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('куски без слов или без времени — без изменений, текст обоих каналов', async () => {
        const longText = `${MANAGER_HELLO} ${CLIENT_ANSWER}`;
        const textOnly = (channelTag: string): IYAChanks => ({
            channelTag,
            alternatives: [{ text: longText }],
        });
        const noTime = (channelTag: string): IYAChanks => ({
            channelTag,
            alternatives: [
                {
                    text: longText,
                    words: longText.split(' ').map(word => ({ word })),
                },
            ],
        });

        for (const chunks of [
            [textOnly('1'), textOnly('2')],
            [noTime('1'), noTime('2')],
        ]) {
            const result = await recognize(chunks);
            expect(result.text).toBe(`${longText} ${longText}`);
            expect(result.segments).toEqual([]);
        }
        expect(logSpy).not.toHaveBeenCalled();
    });
});
