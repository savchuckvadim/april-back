import { cloudWhisperModelOf } from '../cloud-whisper-models';
import { GROQ_BASE_URL, groqPresetOf } from '../groq.preset';

const env =
    (values: Record<string, string>) =>
    (key: string): string | undefined =>
        values[key];

describe('groqPresetOf', () => {
    it('без GROQ_API_KEY пресета нет; ключ из пробелов — тоже', () => {
        expect(groqPresetOf(env({}))).toBeNull();
        expect(groqPresetOf(env({ GROQ_API_KEY: '  ' }))).toBeNull();
    });

    it('с ключом — модели по умолчанию; GROQ_MODEL и GROQ_WHISPER_MODEL их переопределяют', () => {
        expect(groqPresetOf(env({ GROQ_API_KEY: ' gsk ' }))).toEqual({
            apiKey: 'gsk',
            llmModel: 'openai/gpt-oss-120b',
            whisperModel: 'whisper-large-v3-turbo',
        });
        expect(
            groqPresetOf(
                env({
                    GROQ_API_KEY: 'gsk',
                    GROQ_MODEL: 'moonshotai/kimi-k2-instruct-0905',
                    GROQ_WHISPER_MODEL: 'whisper-large-v3',
                }),
            ),
        ).toMatchObject({
            llmModel: 'moonshotai/kimi-k2-instruct-0905',
            whisperModel: 'whisper-large-v3',
        });
        expect(GROQ_BASE_URL).toBe('https://api.groq.com/openai/v1');
    });
});

describe('cloudWhisperModelOf', () => {
    it('Groq и OpenAI — свои модели; свой сервер и кривой адрес — null', () => {
        expect(cloudWhisperModelOf('https://api.groq.com/openai/v1')).toBe(
            'whisper-large-v3-turbo',
        );
        expect(cloudWhisperModelOf('https://API.OpenAI.com/v1/')).toBe(
            'whisper-1',
        );
        expect(cloudWhisperModelOf('http://gpu.local:8000/v1')).toBeNull();
        expect(cloudWhisperModelOf('not a url')).toBeNull();
    });
});
