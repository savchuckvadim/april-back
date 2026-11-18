import { StreamingTranscriptionService } from '../services/streaming-transcription.service';

/**
 * Сервис Яндекса для спек: конфиг без пауз между опросами и повторами,
 * IAM-токен — заглушка. Ответы HTTP подменяются через global.fetch.
 */
export const makeService = (
    overrides: Record<string, string> = {},
): StreamingTranscriptionService => {
    const values: Record<string, string> = {
        YA_FOLDER_ID: 'folder-1',
        YANDEX_STT_POLL_DELAY_MS: '0',
        YANDEX_STT_RETRY_BASE_MS: '0',
        YANDEX_STT_TRANSIENT_RETRIES: '2',
        YANDEX_STT_POLL_MAX_ATTEMPTS: '6',
        ...overrides,
    };
    const config = { get: (key: string) => values[key] };
    const auth = { getIamToken: jest.fn().mockResolvedValue('iam-token') };
    return new StreamingTranscriptionService(config as never, auth as never);
};

/** Ответ 200 с JSON-телом (тело читается один раз — на вызов свой объект). */
export const ok = (body: unknown): Response =>
    new Response(JSON.stringify(body), { status: 200, statusText: 'OK' });
