import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    VIBECODE_TRANSCRIPTION_MODEL,
    VibeCodeClient,
    isTranscriptionFormatRejected,
} from '../vibecode.client';

const API_KEY = 'vibe-key';
const AUDIO = Buffer.from('audio');

function makeClient(): VibeCodeClient {
    const configService = {
        get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    return new VibeCodeClient(configService);
}

interface FetchReply {
    status: number;
    body: unknown;
}

/** Подмена глобального fetch: ответы отдаются по очереди. */
function mockFetchSequence(replies: FetchReply[]): jest.Mock {
    const fetchMock = jest.fn();
    for (const reply of replies) {
        fetchMock.mockResolvedValueOnce({
            ok: reply.status < 400,
            status: reply.status,
            json: () => Promise.resolve(reply.body),
            text: () => Promise.resolve(JSON.stringify(reply.body)),
        });
    }
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

/** Поля формы N-го запроса: модель и формат ответа. */
function formOf(
    fetchMock: jest.Mock,
    index: number,
): { model: FormDataEntryValue | null; format: FormDataEntryValue | null } {
    const call = fetchMock.mock.calls[index] as [string, { body: FormData }];
    return {
        model: call[1].body.get('model'),
        format: call[1].body.get('response_format'),
    };
}

describe('VibeCodeClient — транскрибация', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => {
        globalThis.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it('модель по умолчанию — BitrixGPT Transcribe, а не отключённый 16.11.2026 Whisper', async () => {
        const fetchMock = mockFetchSequence([
            { status: 200, body: { text: 'привет', segments: [{ start: 0 }] } },
        ]);

        const result = await makeClient().transcribeAudioDetailed(
            AUDIO,
            'call.mp3',
            API_KEY,
        );

        expect(VIBECODE_TRANSCRIPTION_MODEL).toBe(
            'bitrix/bitrixgpt-5.6-transcribe',
        );
        expect(formOf(fetchMock, 0)).toEqual({
            model: VIBECODE_TRANSCRIPTION_MODEL,
            format: 'verbose_json',
        });
        expect(result).toEqual({ text: 'привет', segments: [{ start: 0 }] });
    });

    it('модель портала уходит в запрос вместо умолчания', async () => {
        const fetchMock = mockFetchSequence([
            { status: 200, body: { text: 'текст' } },
        ]);

        const result = await makeClient().transcribeAudioDetailed(
            AUDIO,
            'call.mp3',
            API_KEY,
            'bitrix/other-model',
        );

        expect(formOf(fetchMock, 0).model).toBe('bitrix/other-model');
        // Ответ 200 без сегментов — текст есть, сегментов нет.
        expect(result).toEqual({ text: 'текст', segments: null });
    });

    it.each([400, 415, 422])(
        'формат не принят (%i) — один повтор без формата, той же моделью',
        async status => {
            const fetchMock = mockFetchSequence([
                { status, body: { error: 'unsupported response_format' } },
                { status: 200, body: { text: 'только текст' } },
            ]);

            const result = await makeClient().transcribeAudioDetailed(
                AUDIO,
                'call.mp3',
                API_KEY,
            );

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(formOf(fetchMock, 1)).toEqual({
                model: VIBECODE_TRANSCRIPTION_MODEL,
                format: null,
            });
            expect(result).toEqual({ text: 'только текст', segments: null });
        },
    );

    it.each([401, 404, 413, 429, 500])(
        'ошибка %i формат не лечит — повтора без таймкодов нет, ошибка наружу',
        async status => {
            const fetchMock = mockFetchSequence([
                { status, body: { error: 'nope' } },
            ]);

            await expect(
                makeClient().transcribeAudioDetailed(
                    AUDIO,
                    'call.mp3',
                    API_KEY,
                ),
            ).rejects.toThrow(`Vibecode transcription failed [${status}]`);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        },
    );

    it('признак «формат не принят» — только 400, 415 и 422', () => {
        const error = (status: number) =>
            new Error(`Vibecode transcription failed [${status}]: x`);
        expect(
            [400, 415, 422].every(s => isTranscriptionFormatRejected(error(s))),
        ).toBe(true);
        expect(
            [401, 403, 404, 413, 429, 500].some(s =>
                isTranscriptionFormatRejected(error(s)),
            ),
        ).toBe(false);
        expect(isTranscriptionFormatRejected(new Error('fetch failed'))).toBe(
            false,
        );
    });
});
