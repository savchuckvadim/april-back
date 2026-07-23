import { TranscriptionRouterService } from '../provider/transcription-router.service';

type ConfigStub = { get: jest.Mock };

const makeConfig = (values: Record<string, string>): ConfigStub => ({
    get: jest.fn((key: string) => values[key]),
});

const makeVibecode = () => ({
    transcribeAudio: jest.fn().mockResolvedValue('vibecode text'),
});

const makeKeyResolver = () => ({
    resolve: jest.fn().mockResolvedValue('portal-vibe-key'),
});

const makeYandex = () => ({
    transcribeAudio: jest.fn().mockResolvedValue('op-1'),
    getTranscriptionResult: jest.fn().mockResolvedValue('yandex text'),
});

const makeStorage = () => ({
    uploadFile: jest.fn().mockResolvedValue('https://s3/audio.mp3'),
});

const makeRouter = (
    values: Record<string, string>,
    deps?: {
        vibecode?: ReturnType<typeof makeVibecode>;
        yandex?: ReturnType<typeof makeYandex>;
        storage?: ReturnType<typeof makeStorage>;
    },
) => {
    const vibecode = deps?.vibecode ?? makeVibecode();
    const yandex = deps?.yandex ?? makeYandex();
    const storage = deps?.storage ?? makeStorage();
    const keyResolver = makeKeyResolver();
    const router = new TranscriptionRouterService(
        makeConfig(values) as never,
        vibecode as never,
        keyResolver as never,
        yandex as never,
        storage as never,
    );
    return { router, vibecode, yandex, storage, keyResolver };
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
        expect(result).toEqual({ text: 'yandex text', provider: 'yandex' });
        expect(yandex.transcribeAudio).toHaveBeenCalledWith(
            'https://s3/audio.mp3',
        );
        expect(vibecode.transcribeAudio).not.toHaveBeenCalled();
    });

    it('короткий звонок в auto-режиме уходит в Vibecode', async () => {
        const { router, vibecode, yandex } = makeRouter({
            TRANSCRIPTION_YANDEX_MIN_SEC: '600',
        });
        const result = await router.transcribe({ ...input, durationSec: 120 });
        expect(result).toEqual({
            text: 'vibecode text',
            provider: 'bitrix-vibecode',
        });
        expect(yandex.transcribeAudio).not.toHaveBeenCalled();
        // Ключ VibeCode — пер-портальный, из резолвера (vibeKey БД → env).
        expect(vibecode.transcribeAudio).toHaveBeenCalledWith(
            input.buffer,
            input.fileName,
            'portal-vibe-key',
        );
    });

    it('без известной длительности выбирается Vibecode (дешёвый путь)', async () => {
        const { router, vibecode } = makeRouter({});
        const result = await router.transcribe(input);
        expect(result.provider).toBe('bitrix-vibecode');
        expect(vibecode.transcribeAudio).toHaveBeenCalled();
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
        vibecode.transcribeAudio.mockRejectedValue(new Error('timeout'));
        const { router, yandex } = makeRouter({}, { vibecode });
        const result = await router.transcribe({ ...input, durationSec: 60 });
        expect(result).toEqual({ text: 'yandex text', provider: 'yandex' });
        expect(yandex.transcribeAudio).toHaveBeenCalled();
    });
});
