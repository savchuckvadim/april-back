/**
 * Groq — облачный AI-сервис «по одному ключу» (страховка от отказа РФ-поставщиков,
 * план ai/tasks/2026-10-29-ai-providers-per-portal-byok-plan.md, раздел 2):
 * один GROQ_API_KEY закрывает и запасной LLM разборов (`/chat/completions`
 * через @lib/llm-gateway), и Whisper-совместимую транскрибацию
 * (`/audio/transcriptions` через call-lib). Хост за рубежом — из РФ отвечает
 * только через исходящий прокси (@lib/egress-proxy): `api.groq.com` должен
 * быть в EGRESS_PROXY_HOSTS.
 */

/** Имена env Groq — единственное место, где они перечислены. */
export const GROQ_ENV = {
    apiKey: 'GROQ_API_KEY',
    /** Модель разборов; пусто — GROQ_DEFAULT_LLM_MODEL. */
    llmModel: 'GROQ_MODEL',
    /** Модель транскрибации; пусто — GROQ_DEFAULT_WHISPER_MODEL. */
    whisperModel: 'GROQ_WHISPER_MODEL',
} as const;

export const GROQ_HOST = 'api.groq.com';

/** OpenAI-совместимый корень: `/chat/completions`, `/audio/transcriptions`, `/models`. */
export const GROQ_BASE_URL = `https://${GROQ_HOST}/openai/v1`;

/** Поддерживает structured outputs (json_schema) и уверенно пишет по-русски. */
export const GROQ_DEFAULT_LLM_MODEL = 'openai/gpt-oss-120b';

/** Быстрая и дешёвая; точнее — `whisper-large-v3` (задать GROQ_WHISPER_MODEL). */
export const GROQ_DEFAULT_WHISPER_MODEL = 'whisper-large-v3-turbo';

export interface GroqPreset {
    apiKey: string;
    llmModel: string;
    whisperModel: string;
}

/** Groq из env приложения; без ключа — null, пресет в маршрутах не участвует. */
export function groqPresetOf(
    get: (key: string) => string | undefined,
): GroqPreset | null {
    const read = (key: string): string => (get(key) ?? '').trim();
    const apiKey = read(GROQ_ENV.apiKey);
    if (!apiKey) return null;
    return {
        apiKey,
        llmModel: read(GROQ_ENV.llmModel) || GROQ_DEFAULT_LLM_MODEL,
        whisperModel: read(GROQ_ENV.whisperModel) || GROQ_DEFAULT_WHISPER_MODEL,
    };
}
