import { TranscriptionRouterService } from '../provider/transcription-router.service';
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

/** Свой Whisper: по умолчанию не настроен — в маршрутах его нет. */
const makeWhisper = (configured = false) => ({
    configured,
    transcribeDetailed: jest
        .fn()
        .mockResolvedValue({ text: 'whisper text', segments: null }),
});

const makeRouter = (
    values: Record<string, string>,
    deps?: {
        vibecode?: ReturnType<typeof makeVibecode>;
        yandex?: ReturnType<typeof makeYandex>;
        storage?: ReturnType<typeof makeStorage>;
        whisper?: ReturnType<typeof makeWhisper>;
    },
) => {
    const vibecode = deps?.vibecode ?? makeVibecode();
    const yandex = deps?.yandex ?? makeYandex();
    const storage = deps?.storage ?? makeStorage();
    const whisper = deps?.whisper ?? makeWhisper();
    const keyResolver = makeKeyResolver();
    const router = new TranscriptionRouterService(
        makeConfig(values) as never,
        vibecode as never,
        keyResolver as never,
        yandex as never,
        storage as never,
        whisper as never,
    );
    return { router, vibecode, yandex, storage, keyResolver, whisper };
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
            expect(whisper.transcribeDetailed).toHaveBeenCalledWith(
                input.buffer,
                input.fileName,
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
});
