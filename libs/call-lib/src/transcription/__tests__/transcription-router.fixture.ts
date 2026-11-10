import { TranscriptionRouterService } from '../provider/transcription-router.service';

/**
 * Заглушки зависимостей роутера транскрибации — общие для спек роутера и
 * маршрута распознавания портала.
 */
type ConfigStub = { get: jest.Mock };

export const makeConfig = (values: Record<string, string>): ConfigStub => ({
    get: jest.fn((key: string) => values[key]),
});

export const makeVibecode = () => ({
    transcribeAudioDetailed: jest
        .fn()
        .mockResolvedValue({ text: 'vibecode text', segments: null }),
});

export const makeKeyResolver = () => ({
    resolve: jest.fn().mockResolvedValue('portal-vibe-key'),
});

export const makeYandex = () => ({
    transcribeAudio: jest.fn().mockResolvedValue('op-1'),
    getTranscriptionDetailed: jest
        .fn()
        .mockResolvedValue({ text: 'yandex text', segments: [] }),
});

export const makeStorage = () => ({
    uploadFile: jest.fn().mockResolvedValue('https://s3/audio.mp3'),
});

export const ENV_WHISPER = {
    baseUrl: 'http://whisper:8000/v1',
    apiKey: null,
    model: 'Systran/faster-whisper-large-v3',
};

/** Свой Whisper: по умолчанию общий endpoint не задан — в маршрутах его нет. */
export const makeWhisper = (configured = false) => ({
    envSettings: jest.fn().mockResolvedValue({
        endpoint: configured ? ENV_WHISPER : null,
        defaultModel: 'Systran/faster-whisper-large-v3',
    }),
    defaultModel: 'Systran/faster-whisper-large-v3',
    transcribeDetailed: jest
        .fn()
        .mockResolvedValue({ text: 'whisper text', segments: null }),
});

/** Настройки AI портала: по умолчанию строки нет — действуют env. */
export const makePortalSettings = (
    record: Record<string, unknown> | null = null,
) => ({
    getByDomain: jest.fn().mockResolvedValue(record),
});

export const makeRouter = (
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

export const input = {
    buffer: Buffer.from('audio'),
    fileName: 'call_1_2.mp3',
    domain: 'test.bitrix24.ru',
};
