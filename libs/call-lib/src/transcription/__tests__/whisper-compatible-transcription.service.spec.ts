import { Logger } from '@nestjs/common';
import type { VendorSettingsReader } from '@lib/vendor-settings';
import { WhisperCompatibleTranscriptionService } from '../services/whisper-compatible-transcription.service';

/** Прокси выключен: fetch глобальный (его подменяют тесты), адрес как есть. */
const directEgress = {
    fetch: (url: string, init?: RequestInit) => fetch(url, init),
};

const makeService = (
    values: Record<string, string> = {},
    egress: { fetch: typeof directEgress.fetch } = directEgress,
    settings?: VendorSettingsReader,
) =>
    new WhisperCompatibleTranscriptionService(
        { get: (key: string) => values[key] } as never,
        egress as never,
        settings,
    );

/** Читатель настроек вендора: ключ Groq задан в админке, остального нет. */
const adminGroq: VendorSettingsReader = {
    get: key => Promise.resolve(key === 'GROQ_API_KEY' ? 'admin-gsk' : null),
    getMany: keys =>
        Promise.resolve(
            Object.fromEntries(
                keys.map(key => [
                    key,
                    key === 'GROQ_API_KEY' ? 'admin-gsk' : null,
                ]),
            ),
        ),
};

const CONFIGURED = {
    TRANSCRIPTION_WHISPER_BASE_URL: 'http://whisper:8000/v1/',
    TRANSCRIPTION_WHISPER_API_KEY: 'k',
};

const ok = (body: unknown): Response =>
    new Response(JSON.stringify(body), { status: 200 });

describe('WhisperCompatibleTranscriptionService — endpoint портала', () => {
    let fetchMock: jest.Mock;

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('переданный endpoint портала важнее общего из env: его адрес, ключ и модель', async () => {
        fetchMock.mockResolvedValueOnce(ok({ text: 'свой' }));
        const service = makeService(CONFIGURED);

        const result = await service.transcribeDetailed(
            Buffer.from('a'),
            'c.mp3',
            {
                baseUrl: 'http://client-gpu:9000/v1',
                apiKey: null,
                model: 'large-v3-turbo',
            },
        );

        expect(result.text).toBe('свой');
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://client-gpu:9000/v1/audio/transcriptions');
        expect(init.headers).toEqual({});
        expect((init.body as FormData).get('model')).toBe('large-v3-turbo');
        expect((await service.envSettings()).endpoint).toEqual({
            baseUrl: 'http://whisper:8000/v1',
            apiKey: 'k',
            model: 'Systran/faster-whisper-large-v3',
        });
    });
});

describe('WhisperCompatibleTranscriptionService — свой Whisper', () => {
    let fetchMock: jest.Mock;

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it('без адреса и без ключа Groq провайдер не настроен и в сеть не ходит', async () => {
        const service = makeService();
        expect((await service.envSettings()).endpoint).toBeNull();
        await expect(
            service.transcribeDetailed(Buffer.from('a'), 'call.mp3'),
        ).rejects.toThrow('TRANSCRIPTION_WHISPER_BASE_URL');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('GROQ_API_KEY без явного адреса — общий резерв Groq с его моделью; явный адрес важнее; ключ из админки важнее env', async () => {
        const groq = makeService({ GROQ_API_KEY: 'gsk' });
        expect((await groq.envSettings()).endpoint).toEqual({
            baseUrl: 'https://api.groq.com/openai/v1',
            apiKey: 'gsk',
            model: 'whisper-large-v3-turbo',
        });
        expect(groq.defaultModel).toBe('Systran/faster-whisper-large-v3');

        const custom = makeService({
            GROQ_API_KEY: 'gsk',
            GROQ_WHISPER_MODEL: 'whisper-large-v3',
        });
        expect((await custom.envSettings()).endpoint?.model).toBe(
            'whisper-large-v3',
        );

        const explicit = makeService({ ...CONFIGURED, GROQ_API_KEY: 'gsk' });
        expect((await explicit.envSettings()).endpoint?.baseUrl).toBe(
            'http://whisper:8000/v1',
        );

        const admin = makeService(
            { GROQ_API_KEY: 'env-gsk' },
            directEgress,
            adminGroq,
        );
        expect((await admin.envSettings()).endpoint?.apiKey).toBe('admin-gsk');
    });

    it('verbose_json: адрес без двойного слэша, Bearer-ключ, модель и язык в форме, сегменты наружу', async () => {
        fetchMock.mockResolvedValueOnce(
            ok({ text: 'Добрый день', segments: [{ start: 0, end: 1 }] }),
        );
        const service = makeService(CONFIGURED);
        expect((await service.envSettings()).endpoint).not.toBeNull();

        const result = await service.transcribeDetailed(
            Buffer.from('audio'),
            'call.mp3',
        );

        expect(result).toEqual({
            text: 'Добрый день',
            segments: [{ start: 0, end: 1 }],
        });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://whisper:8000/v1/audio/transcriptions');
        expect(init.headers).toEqual({ Authorization: 'Bearer k' });
        const form = init.body as FormData;
        expect(form.get('model')).toBe('Systran/faster-whisper-large-v3');
        expect(form.get('language')).toBe('ru');
        expect(form.get('response_format')).toBe('verbose_json');
    });

    it('4xx на verbose_json — повтор без него; 5xx — ошибка с кодом наружу', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response('bad format', { status: 400 }))
            .mockResolvedValueOnce(ok({ text: 'текст' }));
        const service = makeService(CONFIGURED);

        const result = await service.transcribeDetailed(
            Buffer.from('a'),
            'c.mp3',
        );
        expect(result).toEqual({ text: 'текст', segments: null });
        const secondForm = (fetchMock.mock.calls[1] as [string, RequestInit])[1]
            .body as FormData;
        expect(secondForm.get('response_format')).toBeNull();

        fetchMock.mockResolvedValueOnce(new Response('busy', { status: 503 }));
        await expect(
            service.transcribeDetailed(Buffer.from('a'), 'c.mp3'),
        ).rejects.toThrow('failed [503]: busy');
    });

    it('пустая расшифровка и сетевой обрыв — понятные ошибки', async () => {
        const service = makeService(CONFIGURED);
        fetchMock.mockResolvedValueOnce(ok({ text: '' }));
        await expect(
            service.transcribeDetailed(Buffer.from('a'), 'c.mp3'),
        ).rejects.toThrow('пустая расшифровка');

        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
        await expect(
            service.transcribeDetailed(Buffer.from('a'), 'c.mp3'),
        ).rejects.toThrow('сеть или таймаут — fetch failed');
    });
});
