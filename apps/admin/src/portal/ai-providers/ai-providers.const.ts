import type { TranscriptionProvider } from '@lib/call-lib/transcription/provider/transcription-provider.types';
import type { LlmProviderCode } from '@lib/llm-gateway';

/** Путь и тег Swagger чек-листа провайдеров — только в apps/admin. */
export const AI_PROVIDERS_ADMIN_PATH = 'admin/portal/:portalId/ai-providers';
export const AI_PROVIDERS_ADMIN_TAG = 'Admin Portal AI Providers';

/** Названия провайдеров LLM для админки — по-русски, без кодов в интерфейсе. */
export const LLM_PROVIDER_TITLES: Readonly<Record<LlmProviderCode, string>> = {
    vibecode: 'VibeCode Битрикса',
    'openai-compatible':
        'OpenAI-совместимый сервис (ключ клиента или запасной приложения)',
    'ai-rag': 'Модели резюме (GigaChat / Cloud.ru)',
};

export const TRANSCRIPTION_PROVIDER_TITLES: Readonly<
    Record<TranscriptionProvider, string>
> = {
    yandex: 'Яндекс SpeechKit',
    'bitrix-vibecode': 'VibeCode Битрикса (Whisper)',
    'local-whisper':
        'Whisper-совместимый сервис (свой сервер или облако по ключу)',
};

/** Без этих переменных Яндекс-транскрибация не поднимется (S3 + распознавание). */
export const YANDEX_STT_ENV_KEYS = [
    'YA_FOLDER_ID',
    'YA_ACCESS_KEY_KEY_ID',
    'YA_ACCESS_KEY_SECRET',
] as const;

/** Хост распознавания SpeechKit (StreamingTranscriptionService). */
export const YANDEX_STT_HOST = 'transcribe.api.cloud.yandex.net';

/** Хост адреса для чек-листа; кривой адрес — null. */
export const hostOf = (url: string): string | null => {
    try {
        return new URL(url).host;
    } catch {
        return null;
    }
};
