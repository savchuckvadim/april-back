import { GROQ_DEFAULT_WHISPER_MODEL, GROQ_HOST } from './groq.preset';

/**
 * Модель транскрибации по умолчанию у известных облаков — когда портал задал
 * в админке только адрес: имена моделей у облаков свои, общий дефолт своего
 * сервера (Systran/faster-whisper-large-v3) они не примут.
 */
const CLOUD_WHISPER_MODELS: Readonly<Record<string, string>> = {
    [GROQ_HOST]: GROQ_DEFAULT_WHISPER_MODEL,
    'api.openai.com': 'whisper-1',
};

/** Модель облака по хосту адреса; свой сервер или кривой адрес — null. */
export function cloudWhisperModelOf(baseUrl: string): string | null {
    try {
        const host = new URL(baseUrl).hostname.toLowerCase();
        return CLOUD_WHISPER_MODELS[host] ?? null;
    } catch {
        return null;
    }
}
