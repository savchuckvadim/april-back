import { AI_TRANSCRIPTION_MODES } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.types';
import {
    TRANSCRIPTION_ROUTER_MODES,
    TranscriptionRouterService,
} from '../provider/transcription-router.service';
import { YandexSttHttpError } from '../services/streaming-transcription.service';

type ConfigStub = { get: jest.Mock };

const makeConfig = (values: Record<string, string>): ConfigStub => ({
    get: jest.fn((key: string) => values[key]),
});

const makeVibecode = () => ({
    transcribeAudioDetailed: jest
        .fn()
        .mockResolvedValue({ text: 'vibecode text', segments: null }),
});

const makeKeyResolver = () => ({
    resolve: jest.fn().mockResolvedValue('portal-vibe-key'),
});

const makeYandex = () => ({
    transcribeAudio: jest.fn().mockResolvedValue('op-1'),
    getTranscriptionDetailed: jest
        .fn()
        .mockResolvedValue({ text: 'yandex text', segments: [] }),
});

const makeStorage = () => ({
    uploadFile: jest.fn().mockResolvedValue('https://s3/audio.mp3'),
});

const ENV_WHISPER = {
    baseUrl: 'http://whisper:8000/v1',
    apiKey: null,
    model: 'Systran/faster-whisper-large-v3',
};

/** Свой Whisper: по умолчанию общий endpoint не задан — в маршрутах его нет. */
const makeWhisper = (configured = false) => ({
    configured,
    envEndpoint: configured ? ENV_WHISPER : null,
    defaultModel: 'Systran/faster-whisper-large-v3',
    transcribeDetailed: jest
        .fn()
        .mockResolvedValue({ text: 'whisper text', segments: null }),
});

/** Настройки AI портала: по умолчанию строки нет — действуют env. */
const makePortalSettings = (record: Record<string, unknown> | null = null) => ({
    getByDomain: jest.fn().mockResolvedValue(record),
});

const makeRouter = (
    values: Record<string, string>,
    deps?: {
        vibecode?: ReturnType<typeof makeVibecode>;
        yandex?: ReturnType<typeof makeYandex>;
        storage?: ReturnType<typeof makeStorage>;
        whisper?: ReturnType<typeof makeWhisper>;
        portalSettings?: ReturnType<typeof makePortalSettings>;
    },
) => {
    const vibecode = deps?.vibecode ?? makeVibecode();
    const yandex = deps?.yandex ?? makeYandex();
    const storage = deps?.storage ?? makeStorage();
    const whisper = deps?.whisper ?? makeWhisper();
    const portalSettings = deps?.portalSettings ?? makePortalSettings();
    const keyResolver = makeKeyResolver();
    const router = new TranscriptionRouterService(
        makeConfig(values) as never,
        vibecode as never,
        keyResolver as never,
        yandex as never,
        storage as never,
        whisper as never,
        portalSettings as never,
    );
    return {
        router,
        vibecode,
        yandex,
        storage,
        keyResolver,
        whisper,
        portalSettings,
    };
};

const input = {
    buffer: Buffer.from('audio'),
    fileName: 'call_1_2.mp3',
    domain: 'test.bitrix24.ru',
};

describe('TranscriptionRouterService', () => {
    it('длинный звонок в auto-режиме уходит в Yandex', async () => {
        const { router, yandex, vibecode } = makeRouter({
            TRANSCRIPTION_YANDEX_MIN_SEC: '600',
        });
        const result = await router.transcribe({ ...input, durationSec: 700 });
        expect(result).toEqual({
            text: 'yandex text',
            provider: 'yandex',
            segments: null,
        });
        expect(yandex.transcribeAudio).toHaveBeenCalledWith(
            'https://s3/audio.mp3',
        );
        expect(vibecode.transcribeAudioDetailed).not.toHaveBeenCalled();
    });

    it('короткий звонок в auto-режиме уходит в Vibecode', async () => {
        const { router, vibecode, yandex } = makeRouter({
            TRANSCRIPTION_YANDEX_MIN_SEC: '600',
        });
        const result = await router.transcribe({ ...input, durationSec: 120 });
        expect(result).toEqual({
            text: 'vibecode text',
            provider: 'bitrix-vibecode',
            segments: null,
        });
        expect(yandex.transcribeAudio).not.toHaveBeenCalled();
        // Ключ VibeCode — пер-портальный, из резолвера (vibeKey БД → env).
        expect(vibecode.transcribeAudioDetailed).toHaveBeenCalledWith(
            input.buffer,
            input.fileName,
            'portal-vibe-key',
        );
    });

    it('без известной длительности выбирается Vibecode (дешёвый путь)', async () => {
        const { router, vibecode } = makeRouter({});
        const result = await router.transcribe(input);
        expect(result.provider).toBe('bitrix-vibecode');
        expect(vibecode.transcribeAudioDetailed).toHaveBeenCalled();
    });

    it('TRANSCRIPTION_PROVIDER=yandex форсирует Yandex даже для короткого', async () => {
        const { router, yandex } = makeRouter({
            TRANSCRIPTION_PROVIDER: 'yandex',
        });
        const result = await router.transcribe({ ...input, durationSec: 30 });
        expect(result.provider).toBe('yandex');
        expect(yandex.transcribeAudio).toHaveBeenCalled();
    });

    it('при ошибке Vibecode выполняется fallback на Yandex', async () => {
        const vibecode = makeVibecode();
        vibecode.transcribeAudioDetailed.mockRejectedValue(
            new Error('timeout'),
        );
        const { router, yandex } = makeRouter({}, { vibecode });
        const result = await router.transcribe({ ...input, durationSec: 60 });
        expect(result).toEqual({
            text: 'yandex text',
            provider: 'yandex',
            segments: null,
        });
        expect(yandex.transcribeAudio).toHaveBeenCalled();
    });

    describe('временный сбой Yandex (ночь 28.10.2026)', () => {
        const transient = (phase: 'submit' | 'poll') =>
            new YandexSttHttpError(
                500,
                'req-1',
                phase,
                'Яндекс SpeechKit: HTTP 500 Internal Server Error',
            );

        it('5xx на отправке в auto-режиме — fallback на Vibecode', async () => {
            const yandex = makeYandex();
            yandex.transcribeAudio.mockRejectedValue(transient('submit'));
            const { router, vibecode } = makeRouter(
                { TRANSCRIPTION_YANDEX_MIN_SEC: '600' },
                { yandex },
            );
            const result = await router.transcribe({
                ...input,
                durationSec: 700,
            });
            expect(result.provider).toBe('bitrix-vibecode');
            expect(vibecode.transcribeAudioDetailed).toHaveBeenCalledTimes(1);
        });

        it('5xx на опросе результата тоже ведёт на Vibecode', async () => {
            const yandex = makeYandex();
            yandex.getTranscriptionDetailed.mockRejectedValue(
                transient('poll'),
            );
            const { router, vibecode } = makeRouter(
                { TRANSCRIPTION_YANDEX_MIN_SEC: '600' },
                { yandex },
            );
            const result = await router.transcribe({
                ...input,
                durationSec: 700,
            });
            expect(result.provider).toBe('bitrix-vibecode');
            expect(vibecode.transcribeAudioDetailed).toHaveBeenCalledTimes(1);
        });

        it('постоянная ошибка Yandex (403) — без fallback', async () => {
            const yandex = makeYandex();
            yandex.transcribeAudio.mockRejectedValue(
                new YandexSttHttpError(403, 'req-2', 'submit', 'HTTP 403'),
            );
            const { router, vibecode } = makeRouter(
                { TRANSCRIPTION_YANDEX_MIN_SEC: '600' },
                { yandex },
            );
            await expect(
                router.transcribe({ ...input, durationSec: 700 }),
            ).rejects.toThrow('HTTP 403');
            expect(vibecode.transcribeAudioDetailed).not.toHaveBeenCalled();
        });

        it('в принудительном режиме yandex fallback на Vibecode нет', async () => {
            const yandex = makeYandex();
            yandex.transcribeAudio.mockRejectedValue(transient('submit'));
            const { router, vibecode } = makeRouter(
                { TRANSCRIPTION_PROVIDER: 'yandex' },
                { yandex },
            );
            await expect(
                router.transcribe({ ...input, durationSec: 700 }),
            ).rejects.toThrow('HTTP 500');
            expect(vibecode.transcribeAudioDetailed).not.toHaveBeenCalled();
        });
    });

    /** План устойчивости к провайдерам (28.10.2026): третий транскрибатор. */
    describe('свой Whisper — последний резерв', () => {
        const yandexDown = () => {
            const yandex = makeYandex();
            yandex.transcribeAudio.mockRejectedValue(
                new YandexSttHttpError(503, 'r', 'submit', 'HTTP 503'),
            );
            return yandex;
        };
        const vibecodeDown = () => {
            const vibecode = makeVibecode();
            vibecode.transcribeAudioDetailed.mockRejectedValue(
                new Error('Vibecode transcription failed [502]: bad gateway'),
            );
            return vibecode;
        };

        it('длинный звонок: Yandex и Vibecode отказали — расшифровка от своего Whisper', async () => {
            const { router, whisper } = makeRouter(
                { TRANSCRIPTION_YANDEX_MIN_SEC: '600' },
                {
                    yandex: yandexDown(),
                    vibecode: vibecodeDown(),
                    whisper: makeWhisper(true),
                },
            );
            const result = await router.transcribe({
                ...input,
                durationSec: 700,
            });
            expect(result).toEqual({
                text: 'whisper text',
                provider: 'local-whisper',
                segments: null,
            });
            // Общий endpoint приложения передаётся явно — у портала своего нет.
            expect(whisper.transcribeDetailed).toHaveBeenCalledWith(
                input.buffer,
                input.fileName,
                ENV_WHISPER,
            );
        });

        it('короткий звонок: Vibecode и Yandex отказали — свой Whisper', async () => {
            const { router } = makeRouter(
                {},
                {
                    yandex: yandexDown(),
                    vibecode: vibecodeDown(),
                    whisper: makeWhisper(true),
                },
            );
            const result = await router.transcribe({
                ...input,
                durationSec: 60,
            });
            expect(result.provider).toBe('local-whisper');
        });

        it('Whisper не настроен — ошибка последнего из двух провайдеров, как прежде', async () => {
            const long = makeRouter(
                { TRANSCRIPTION_YANDEX_MIN_SEC: '600' },
                { yandex: yandexDown(), vibecode: vibecodeDown() },
            );
            await expect(
                long.router.transcribe({ ...input, durationSec: 700 }),
            ).rejects.toThrow('Vibecode transcription failed [502]');
            expect(long.whisper.transcribeDetailed).not.toHaveBeenCalled();

            const short = makeRouter(
                {},
                { yandex: yandexDown(), vibecode: vibecodeDown() },
            );
            await expect(
                short.router.transcribe({ ...input, durationSec: 60 }),
            ).rejects.toThrow('HTTP 503');
        });

        it('TRANSCRIPTION_PROVIDER=whisper — только свой Whisper, без запасных путей', async () => {
            const whisper = makeWhisper(true);
            const { router, yandex, vibecode } = makeRouter(
                { TRANSCRIPTION_PROVIDER: 'whisper' },
                { whisper },
            );
            const result = await router.transcribe({
                ...input,
                durationSec: 700,
            });
            expect(result.provider).toBe('local-whisper');
            expect(yandex.transcribeAudio).not.toHaveBeenCalled();
            expect(vibecode.transcribeAudioDetailed).not.toHaveBeenCalled();

            whisper.transcribeDetailed.mockRejectedValueOnce(
                new Error('Whisper failed [500]: oom'),
            );
            await expect(
                router.transcribe({ ...input, durationSec: 700 }),
            ).rejects.toThrow('Whisper failed [500]');
            expect(yandex.transcribeAudio).not.toHaveBeenCalled();
        });
    });

    /** Настройки портала важнее env (29.10.2026): клиент считает у себя и платит сам. */
    describe('настройки портала: режим и свой Whisper', () => {
        it('режимы роутера и настроек портала совпадают (дубль в portal-lib из-за направления зависимости)', () => {
            expect([...TRANSCRIPTION_ROUTER_MODES]).toEqual([
                ...AI_TRANSCRIPTION_MODES,
            ]);
        });

        it('портал с режимом whisper и своим адресом: запись уходит на его endpoint с его ключом и моделью', async () => {
            const whisper = makeWhisper(false);
            const { router, yandex, vibecode } = makeRouter(
                {},
                {
                    whisper,
                    portalSettings: makePortalSettings({
                        transcriptionMode: 'whisper',
                        whisperBaseUrl: 'http://client-gpu:9000/v1/',
                        whisperModel: 'large-v3-turbo',
                        whisperApiKey: 'client-key',
                    }),
                },
            );

            const result = await router.transcribe({
                ...input,
                durationSec: 700,
            });

            expect(result.provider).toBe('local-whisper');
            expect(whisper.transcribeDetailed).toHaveBeenCalledWith(
                input.buffer,
                input.fileName,
                {
                    baseUrl: 'http://client-gpu:9000/v1',
                    apiKey: 'client-key',
                    model: 'large-v3-turbo',
                },
            );
            expect(yandex.transcribeAudio).not.toHaveBeenCalled();
            expect(vibecode.transcribeAudioDetailed).not.toHaveBeenCalled();
        });

        it('портал принудительно на Yandex — короткий звонок идёт в Yandex, хотя приложение в auto', async () => {
            const { router, yandex } = makeRouter(
                { TRANSCRIPTION_YANDEX_MIN_SEC: '600' },
                {
                    portalSettings: makePortalSettings({
                        transcriptionMode: 'yandex',
                    }),
                },
            );
            const result = await router.transcribe({
                ...input,
                durationSec: 30,
            });
            expect(result.provider).toBe('yandex');
            expect(yandex.transcribeAudio).toHaveBeenCalled();
        });

        it('свой Whisper портала служит резервом и в auto; общего endpoint нет — всё равно есть куда падать', async () => {
            const yandex = makeYandex();
            yandex.transcribeAudio.mockRejectedValue(
                new YandexSttHttpError(503, 'r', 'submit', 'HTTP 503'),
            );
            const vibecode = makeVibecode();
            vibecode.transcribeAudioDetailed.mockRejectedValue(
                new Error('Vibecode transcription failed [502]: down'),
            );
            const whisper = makeWhisper(false);
            const { router } = makeRouter(
                { TRANSCRIPTION_YANDEX_MIN_SEC: '600' },
                {
                    yandex,
                    vibecode,
                    whisper,
                    portalSettings: makePortalSettings({
                        whisperBaseUrl: 'http://client-gpu:9000/v1',
                    }),
                },
            );

            const result = await router.transcribe({
                ...input,
                durationSec: 700,
            });

            expect(result.provider).toBe('local-whisper');
            const endpoint = (
                whisper.transcribeDetailed.mock.calls[0] as unknown[]
            )[2] as { model: string; apiKey: string | null };
            expect(endpoint.model).toBe('Systran/faster-whisper-large-v3');
            expect(endpoint.apiKey).toBeNull();
        });

        it('ошибка чтения настроек портала — общие значения, звонок не теряется', async () => {
            const portalSettings = makePortalSettings();
            portalSettings.getByDomain.mockRejectedValueOnce(
                new Error('БД недоступна'),
            );
            const { router } = makeRouter({}, { portalSettings });
            const result = await router.transcribe({
                ...input,
                durationSec: 60,
            });
            expect(result.provider).toBe('bitrix-vibecode');
        });
    });
});
