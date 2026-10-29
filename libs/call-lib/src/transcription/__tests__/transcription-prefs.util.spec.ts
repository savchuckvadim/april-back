import {
    resolveTranscriptionPrefs,
    type TranscriptionEnvPrefs,
} from '../provider/transcription-prefs.util';

const ENV_WHISPER = {
    baseUrl: 'http://whisper:8000/v1',
    apiKey: null,
    model: 'Systran/faster-whisper-large-v3',
};

const env = (
    over: Partial<TranscriptionEnvPrefs> = {},
): TranscriptionEnvPrefs => ({
    mode: 'auto',
    whisper: null,
    defaultWhisperModel: 'Systran/faster-whisper-large-v3',
    ...over,
});

const record = (over: Record<string, unknown> = {}) => ({
    transcriptionMode: null,
    whisperBaseUrl: null,
    whisperModel: null,
    whisperApiKey: null,
    ...over,
});

describe('resolveTranscriptionPrefs', () => {
    it('нет строки портала — общие значения, источники env; без Whisper источник null', () => {
        expect(resolveTranscriptionPrefs(null, env())).toEqual({
            mode: 'auto',
            modeSource: 'env',
            whisper: null,
            whisperSource: null,
        });
        expect(
            resolveTranscriptionPrefs(null, env({ whisper: ENV_WHISPER })),
        ).toMatchObject({ whisper: ENV_WHISPER, whisperSource: 'env' });
    });

    it('режим портала важнее env; неизвестный код режима — как не задан', () => {
        expect(
            resolveTranscriptionPrefs(
                record({ transcriptionMode: 'yandex' }),
                env({ mode: 'vibecode' }),
            ),
        ).toMatchObject({ mode: 'yandex', modeSource: 'portal' });
        expect(
            resolveTranscriptionPrefs(
                record({ transcriptionMode: 'deepgram' }),
                env({ mode: 'vibecode' }),
            ),
        ).toMatchObject({ mode: 'vibecode', modeSource: 'env' });
    });

    it('свой Whisper портала: адрес без хвостового слэша, ключ, модель портала или общая', () => {
        const prefs = resolveTranscriptionPrefs(
            record({
                whisperBaseUrl: 'https://api.groq.com/openai/v1/',
                whisperApiKey: 'gk',
                whisperModel: '  whisper-large-v3-turbo ',
            }),
            env({ whisper: ENV_WHISPER }),
        );
        expect(prefs.whisper).toEqual({
            baseUrl: 'https://api.groq.com/openai/v1',
            apiKey: 'gk',
            model: 'whisper-large-v3-turbo',
        });
        expect(prefs.whisperSource).toBe('portal');

        const onlyAddress = resolveTranscriptionPrefs(
            record({ whisperBaseUrl: 'http://gpu.local:8000/v1' }),
            env(),
        );
        expect(onlyAddress.whisper).toEqual({
            baseUrl: 'http://gpu.local:8000/v1',
            apiKey: null,
            model: 'Systran/faster-whisper-large-v3',
        });
    });

    it('портал задал только адрес облака — модель облака по хосту (Groq, OpenAI), а не общая', () => {
        const groq = resolveTranscriptionPrefs(
            record({
                whisperBaseUrl: 'https://api.groq.com/openai/v1',
                whisperApiKey: 'gk',
            }),
            env(),
        );
        expect(groq.whisper).toEqual({
            baseUrl: 'https://api.groq.com/openai/v1',
            apiKey: 'gk',
            model: 'whisper-large-v3-turbo',
        });
        expect(
            resolveTranscriptionPrefs(
                record({ whisperBaseUrl: 'https://api.openai.com/v1/' }),
                env(),
            ).whisper?.model,
        ).toBe('whisper-1');
    });

    it('пустой адрес у портала — общий Whisper приложения', () => {
        expect(
            resolveTranscriptionPrefs(
                record({ whisperBaseUrl: '   ', whisperApiKey: 'x' }),
                env({ whisper: ENV_WHISPER }),
            ),
        ).toMatchObject({ whisper: ENV_WHISPER, whisperSource: 'env' });
    });
});
