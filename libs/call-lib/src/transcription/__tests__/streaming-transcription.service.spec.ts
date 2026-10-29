import { Logger } from '@nestjs/common';
import {
    StreamingTranscriptionService,
    YandexSttHttpError,
    channelsRequiredByYandex,
    isTransientYandexError,
} from '../services/streaming-transcription.service';

/**
 * Терпимость к сбоям Яндекса (ночь 28.10.2026: 500 на опросе операций
 * ронял 35-минутное ожидание первым же ответом). Проверяем: повторы по
 * 5xx/сети, немедленный отказ по 4xx, предел повторов, ошибка операции,
 * текст ошибки с кодом и requestId.
 */

const yandexErrorBody = (requestId: string): string =>
    JSON.stringify({
        code: 13,
        message: 'Internal server error',
        details: [
            {
                '@type': 'type.googleapis.com/google.rpc.RequestInfo',
                requestId,
            },
        ],
    });

const http = (status: number, body: string, statusText = ''): Response =>
    new Response(body, { status, statusText });

const ok = (body: unknown): Response =>
    new Response(JSON.stringify(body), { status: 200, statusText: 'OK' });

const doneResponse = {
    done: true,
    response: {
        chunks: [{ channelTag: '1', alternatives: [{ text: 'Добрый день' }] }],
    },
};

const makeService = (
    overrides: Record<string, string> = {},
): StreamingTranscriptionService => {
    const values: Record<string, string> = {
        YA_FOLDER_ID: 'folder-1',
        YANDEX_STT_POLL_DELAY_MS: '0',
        YANDEX_STT_RETRY_BASE_MS: '0',
        YANDEX_STT_TRANSIENT_RETRIES: '2',
        YANDEX_STT_POLL_MAX_ATTEMPTS: '6',
        ...overrides,
    };
    const config = { get: (key: string) => values[key] };
    const auth = { getIamToken: jest.fn().mockResolvedValue('iam-token') };
    return new StreamingTranscriptionService(config as never, auth as never);
};

describe('StreamingTranscriptionService — терпимость к сбоям Яндекса', () => {
    let fetchMock: jest.Mock;

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('отправка аудио', () => {
        it('число каналов уходит в спецификацию: по умолчанию 1, для стерео 2', async () => {
            // Каждому вызову — свой Response: тело читается один раз.
            fetchMock.mockImplementation(() =>
                Promise.resolve(ok({ id: 'op-1' })),
            );
            const service = makeService();
            await service.transcribeAudio('s3://a.mp3');
            await service.transcribeAudio('s3://a.mp3', 2);
            const channelsOf = (call: unknown[]): number =>
                (
                    JSON.parse((call[1] as { body: string }).body) as {
                        config: {
                            specification: { audioChannelCount: number };
                        };
                    }
                ).config.specification.audioChannelCount;
            expect(channelsOf(fetchMock.mock.calls[0] as unknown[])).toBe(1);
            expect(channelsOf(fetchMock.mock.calls[1] as unknown[])).toBe(2);
        });

        it('два 500 подряд, затем 200 — операция получена', async () => {
            fetchMock
                .mockResolvedValueOnce(
                    http(500, yandexErrorBody('r1'), 'Internal Server Error'),
                )
                .mockResolvedValueOnce(
                    http(502, yandexErrorBody('r2'), 'Bad Gateway'),
                )
                .mockResolvedValueOnce(ok({ id: 'op-1' }));

            await expect(
                makeService().transcribeAudio('https://s3/a.mp3'),
            ).resolves.toBe('op-1');
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });

        it('403 — отказ сразу, без повторов, с кодом в тексте', async () => {
            fetchMock.mockResolvedValueOnce(
                http(403, yandexErrorBody('r-403'), 'Forbidden'),
            );

            const promise = makeService().transcribeAudio('https://s3/a.mp3');
            await expect(promise).rejects.toBeInstanceOf(YandexSttHttpError);
            await expect(promise).rejects.toThrow(
                'HTTP 403 Forbidden при отправке аудио (requestId r-403)',
            );
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('сбоев больше предела — отказ после transientRetries повторов', async () => {
            // Тело Response читается один раз — на каждый вызов свой объект.
            fetchMock.mockImplementation(() =>
                Promise.resolve(
                    http(503, yandexErrorBody('r-503'), 'Service Unavailable'),
                ),
            );

            await expect(
                makeService().transcribeAudio('https://s3/a.mp3'),
            ).rejects.toThrow('HTTP 503');
            // первая попытка + два повтора
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });

        it('сетевой обрыв считается временным и повторяется', async () => {
            fetchMock
                .mockRejectedValueOnce(new TypeError('fetch failed'))
                .mockResolvedValueOnce(ok({ id: 'op-2' }));

            await expect(
                makeService().transcribeAudio('https://s3/a.mp3'),
            ).resolves.toBe('op-2');
        });
    });

    describe('стерео-запись (gsr 29.10.2026)', () => {
        it('куски каналов выстраиваются по времени первого слова, сегменты режутся по каналу', async () => {
            fetchMock.mockResolvedValueOnce(
                ok({
                    done: true,
                    response: {
                        chunks: [
                            {
                                channelTag: '1',
                                alternatives: [
                                    {
                                        text: 'Чем могу помочь',
                                        words: [
                                            {
                                                word: 'Чем',
                                                startTime: '4.0s',
                                                endTime: '4.3s',
                                            },
                                            {
                                                word: 'могу',
                                                startTime: '4.4s',
                                                endTime: '4.7s',
                                            },
                                            {
                                                word: 'помочь',
                                                startTime: '4.8s',
                                                endTime: '5.2s',
                                            },
                                        ],
                                    },
                                ],
                            },
                            {
                                channelTag: '2',
                                alternatives: [
                                    {
                                        text: 'Добрый день',
                                        words: [
                                            {
                                                word: 'Добрый',
                                                startTime: '0.5s',
                                                endTime: '0.9s',
                                            },
                                            {
                                                word: 'день',
                                                startTime: '1.0s',
                                                endTime: '1.4s',
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                }),
            );
            const result = await makeService().getTranscriptionDetailed('op-1');
            expect(result.text).toBe('Добрый день Чем могу помочь');
            expect(
                result.segments.map(segment => [segment.speaker, segment.text]),
            ).toEqual([
                ['unknown', 'Добрый день'],
                ['unknown', 'Чем могу помочь'],
            ]);
        });

        it('channelsRequiredByYandex: число каналов из ошибки спецификации, иначе null', () => {
            expect(
                channelsRequiredByYandex(
                    new Error(
                        'Яндекс завершил операцию e03 ошибкой: 3 Audio has 2 channels, but 1 requested in specification',
                    ),
                ),
            ).toBe(2);
            expect(
                channelsRequiredByYandex(
                    new Error(
                        'Audio has 1 channel, but 2 requested in specification',
                    ),
                ),
            ).toBe(1);
            expect(
                channelsRequiredByYandex(
                    new Error('Audio has 6 channels, but 1 requested'),
                ),
            ).toBeNull();
            expect(channelsRequiredByYandex(new Error('Internal'))).toBeNull();
            expect(channelsRequiredByYandex('строка')).toBeNull();
        });
    });

    describe('опрос результата', () => {
        it('500 посреди ожидания не роняет опрос — результат получен', async () => {
            fetchMock
                .mockResolvedValueOnce(ok({ done: false }))
                .mockResolvedValueOnce(
                    http(
                        500,
                        yandexErrorBody('r-poll'),
                        'Internal Server Error',
                    ),
                )
                .mockResolvedValueOnce(ok(doneResponse));

            const result = await makeService().getTranscriptionDetailed('op-1');
            expect(result.text).toBe('Добрый день');
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });

        it('сбои ПОДРЯД сверх предела — отказ с кодом и requestId', async () => {
            fetchMock.mockImplementation(() =>
                Promise.resolve(
                    http(500, yandexErrorBody('r-x'), 'Internal Server Error'),
                ),
            );

            await expect(
                makeService().getTranscriptionDetailed('op-9'),
            ).rejects.toThrow(
                'HTTP 500 Internal Server Error при опросе операции op-9 (requestId r-x)',
            );
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });

        it('счётчик сбоев сбрасывается после удачного ответа', async () => {
            fetchMock
                .mockResolvedValueOnce(http(500, '', 'Internal Server Error'))
                .mockResolvedValueOnce(http(500, '', 'Internal Server Error'))
                .mockResolvedValueOnce(ok({ done: false }))
                .mockResolvedValueOnce(http(500, '', 'Internal Server Error'))
                .mockResolvedValueOnce(ok(doneResponse));

            await expect(
                makeService().getTranscriptionDetailed('op-1'),
            ).resolves.toMatchObject({ text: 'Добрый день' });
        });

        it('операция завершилась ошибкой Яндекса — текст ошибки наружу', async () => {
            fetchMock.mockResolvedValueOnce(
                ok({
                    done: true,
                    error: { code: 3, message: 'audio too short' },
                }),
            );

            await expect(
                makeService().getTranscriptionDetailed('op-1'),
            ).rejects.toThrow(
                'Яндекс завершил операцию op-1 ошибкой: 3 audio too short',
            );
        });

        it('404 операции — постоянная ошибка, без повторов', async () => {
            fetchMock.mockResolvedValueOnce(http(404, '{}', 'Not Found'));

            await expect(
                makeService().getTranscriptionDetailed('op-1'),
            ).rejects.toThrow('HTTP 404 Not Found при опросе операции op-1');
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('не завершилась за отведённые опросы — таймаут', async () => {
            fetchMock.mockImplementation(() =>
                Promise.resolve(ok({ done: false })),
            );

            await expect(
                makeService({
                    YANDEX_STT_POLL_MAX_ATTEMPTS: '3',
                }).getTranscriptionDetailed('op-1'),
            ).rejects.toThrow('за отведённое время');
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });
    });

    describe('isTransientYandexError', () => {
        it('5xx, 429 и сеть — временные; 4xx и прочее — нет', () => {
            expect(
                isTransientYandexError(
                    new YandexSttHttpError(500, null, 'poll', 'x'),
                ),
            ).toBe(true);
            expect(
                isTransientYandexError(
                    new YandexSttHttpError(429, null, 'submit', 'x'),
                ),
            ).toBe(true);
            expect(
                isTransientYandexError(
                    new YandexSttHttpError(null, null, 'submit', 'x'),
                ),
            ).toBe(true);
            expect(
                isTransientYandexError(
                    new YandexSttHttpError(403, null, 'submit', 'x'),
                ),
            ).toBe(false);
            expect(isTransientYandexError(new Error('socket hang up'))).toBe(
                true,
            );
            expect(
                isTransientYandexError(new Error('YA_FOLDER_ID is not set')),
            ).toBe(false);
        });
    });
});
