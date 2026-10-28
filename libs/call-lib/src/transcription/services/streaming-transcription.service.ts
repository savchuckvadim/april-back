import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { YandexAuthService } from '@lib/call-lib/yandex/yandex-auth.service';
import { wordsToSegments, yandexWordsOf } from '../lib/segments.mapper';
import type { TranscriptSegment } from '../types/transcript-segment.types';

export interface IYAChanks {
    /** Номер канала записи ('1', '2'); моно — один канал. */
    channelTag?: string;
    alternatives?: { text?: string; words?: unknown[] }[];
}

/** Текст и сегменты с таймкодами из слов Yandex (П6). */
export interface YandexTranscriptionDetailed {
    text: string;
    segments: TranscriptSegment[];
}

export interface IYAResponse {
    done?: boolean;
    response?: { chunks?: IYAChanks[] };
    /** Операция завершилась ошибкой на стороне Яндекса. */
    error?: { code?: number; message?: string };
}

/** Фаза обращения к Яндексу — для текста ошибки и логов. */
export type YandexSttPhase = 'submit' | 'poll';

/**
 * Ошибка HTTP Яндекса: код, requestId (по нему поддержка Яндекса находит
 * инцидент) и фаза. По `transient` роутер решает, переключаться ли на
 * запасной провайдер: 5xx и 429 — временное, 4xx (нет прав, плохой запрос)
 * повторять бессмысленно. `status === null` — сетевая ошибка (обрыв,
 * «fetch failed») — тоже временная.
 *
 * Появилась после ночи 28.10.2026: Яндекс отдавал 500 на опросе операций,
 * а первый же не-200 ответ ронял 35-минутное ожидание целиком.
 */
export class YandexSttHttpError extends Error {
    readonly name = 'YandexSttHttpError';

    constructor(
        readonly status: number | null,
        readonly requestId: string | null,
        readonly phase: YandexSttPhase,
        message: string,
    ) {
        super(message);
    }

    get transient(): boolean {
        return (
            this.status === null || this.status >= 500 || this.status === 429
        );
    }
}

const NETWORK_ERROR_RE =
    /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|UND_ERR/i;

/** Временная ли ошибка пути Яндекса (HTTP 5xx/429 или сеть) — повтор и запасной путь уместны. */
export const isTransientYandexError = (error: unknown): boolean => {
    if (error instanceof YandexSttHttpError) return error.transient;
    return error instanceof Error && NETWORK_ERROR_RE.test(error.message);
};

/** requestId из тела ошибки Яндекса (details[].requestId). */
const extractRequestId = (body: string): string | null => {
    const match = body.match(/"requestId"\s*:\s*"([^"]+)"/);
    return match ? match[1] : null;
};

/** Терпимость к сбоям Яндекса (env, см. apps/event-sales/.env.example). */
interface YandexSttTolerance {
    pollDelayMs: number;
    pollMaxAttempts: number;
    /** Сколько ПОДРЯД временных сбоев терпим до отказа — на отправке и на опросе. */
    transientRetries: number;
    retryBaseMs: number;
}

const DEFAULT_TOLERANCE: YandexSttTolerance = {
    pollDelayMs: 3000,
    pollMaxAttempts: 700,
    transientRetries: 5,
    retryBaseMs: 2000,
};

/** Потолок паузы между повторами при удвоении. */
const RETRY_MAX_MS = 30_000;

@Injectable()
export class StreamingTranscriptionService {
    private readonly logger = new Logger(StreamingTranscriptionService.name);
    private readonly apiUrl =
        'https://transcribe.api.cloud.yandex.net/speech/stt/v2/longRunningRecognize';
    private readonly operationsUrl =
        'https://operation.api.cloud.yandex.net/operations';
    private readonly folderId: string;
    private readonly tolerance: YandexSttTolerance;

    constructor(
        private readonly configService: ConfigService,
        private readonly yandexAuthService: YandexAuthService,
    ) {
        const folderId = this.configService.get<string>('YA_FOLDER_ID');
        if (!folderId) {
            throw new Error('YA_FOLDER_ID is not set');
        }
        this.folderId = folderId;
        this.tolerance = {
            pollDelayMs: this.numberSetting(
                'YANDEX_STT_POLL_DELAY_MS',
                DEFAULT_TOLERANCE.pollDelayMs,
            ),
            pollMaxAttempts: this.numberSetting(
                'YANDEX_STT_POLL_MAX_ATTEMPTS',
                DEFAULT_TOLERANCE.pollMaxAttempts,
            ),
            transientRetries: this.numberSetting(
                'YANDEX_STT_TRANSIENT_RETRIES',
                DEFAULT_TOLERANCE.transientRetries,
            ),
            retryBaseMs: this.numberSetting(
                'YANDEX_STT_RETRY_BASE_MS',
                DEFAULT_TOLERANCE.retryBaseMs,
            ),
        };
    }

    /** Отправка аудио на распознавание; временные сбои повторяются с паузой. */
    async transcribeAudio(fileUri: string): Promise<string> {
        const body = JSON.stringify({
            config: {
                folderId: this.folderId,
                specification: {
                    languageCode: 'ru-RU',
                    model: 'general',
                    profanityFilter: false,
                    audioEncoding: 'MP3',
                    sampleRateHertz: 48000,
                    audioChannelCount: 1,
                    rawResults: false,
                },
            },
            audio: { uri: fileUri },
        });

        let failures = 0;
        for (;;) {
            try {
                const response = await this.request(this.apiUrl, 'submit', {
                    method: 'POST',
                    body,
                });
                const data = (await response.json()) as { id?: string };
                if (!data?.id) {
                    throw new Error(
                        'Яндекс не вернул id операции распознавания',
                    );
                }
                return data.id;
            } catch (error) {
                failures += 1;
                if (this.giveUp(error, failures)) {
                    this.logger.error(
                        `Отправка аудио в Яндекс не удалась: ${(error as Error).message}`,
                        { fileUri, failures },
                    );
                    throw error;
                }
                await this.backoff(failures, (error as Error).message, {
                    phase: 'submit',
                    fileUri,
                });
            }
        }
    }

    async getTranscriptionResult(operationId: string): Promise<string> {
        return (await this.getTranscriptionDetailed(operationId)).text;
    }

    /**
     * Текст и сегменты: слова с временем режутся по паузе и каналу.
     * Временный сбой опроса (5xx/429/сеть) не роняет ожидание — повтор
     * с паузой; сдаёмся после `transientRetries` сбоев ПОДРЯД.
     */
    async getTranscriptionDetailed(
        operationId: string,
    ): Promise<YandexTranscriptionDetailed> {
        let failures = 0;
        for (
            let attempt = 0;
            attempt < this.tolerance.pollMaxAttempts;
            attempt++
        ) {
            let data: IYAResponse;
            try {
                const response = await this.request(
                    `${this.operationsUrl}/${operationId}`,
                    'poll',
                    { operationId },
                );
                data = (await response.json()) as IYAResponse;
                failures = 0;
            } catch (error) {
                failures += 1;
                if (this.giveUp(error, failures)) {
                    this.logger.error(
                        `Опрос операции ${operationId} прекращён: ${(error as Error).message}`,
                        { operationId, failures },
                    );
                    throw error;
                }
                await this.backoff(failures, (error as Error).message, {
                    phase: 'poll',
                    operationId,
                });
                continue;
            }

            if (data?.done) return this.finished(operationId, data);
            await this.sleep(this.tolerance.pollDelayMs);
        }

        throw new Error(
            `Яндекс не завершил распознавание операции ${operationId} за отведённое время`,
        );
    }

    /** Разбор завершённой операции: ошибка Яндекса, пустой результат, текст. */
    private finished(
        operationId: string,
        data: IYAResponse,
    ): YandexTranscriptionDetailed {
        if (data.error) {
            throw new Error(
                `Яндекс завершил операцию ${operationId} ошибкой: ` +
                    `${data.error.code ?? '?'} ${data.error.message ?? ''}`.trim(),
            );
        }
        const chunks = data.response?.chunks ?? [];
        if (chunks.length === 0) {
            this.logger.error(
                `Операция ${operationId} без результата распознавания`,
                data,
            );
            throw new Error(
                'Яндекс вернул операцию без результата распознавания',
            );
        }
        const transcription = chunks
            .map(chunk => chunk.alternatives?.[0]?.text)
            .join(' ');
        if (!transcription.trim()) {
            this.logger.error(
                `Операция ${operationId}: пустая расшифровка`,
                data,
            );
            throw new Error('Яндекс вернул пустую расшифровку');
        }
        return {
            text: transcription,
            segments: wordsToSegments(yandexWordsOf(chunks)),
        };
    }

    /**
     * Один HTTP-вызов Яндекса. Не-200 и сетевой обрыв превращаются в
     * YandexSttHttpError с кодом и requestId — так текст ошибки в логе и в
     * алерте сразу говорит, что случилось и чей это сбой.
     */
    private async request(
        url: string,
        phase: YandexSttPhase,
        init: { method?: 'GET' | 'POST'; body?: string; operationId?: string },
    ): Promise<Response> {
        const iamToken = await this.yandexAuthService.getIamToken();
        const where =
            phase === 'submit'
                ? 'отправке аудио'
                : `опросе операции ${init.operationId ?? '?'}`;
        let response: Response;
        try {
            response = await fetch(url, {
                method: init.method ?? 'GET',
                headers: {
                    Authorization: `Bearer ${iamToken}`,
                    ...(init.body
                        ? { 'Content-Type': 'application/json' }
                        : {}),
                },
                body: init.body,
            });
        } catch (error) {
            throw new YandexSttHttpError(
                null,
                null,
                phase,
                `Яндекс SpeechKit: сеть при ${where} (${(error as Error).message})`,
            );
        }
        if (response.ok) return response;

        const text = await response.text().catch(() => '');
        const requestId = extractRequestId(text);
        this.logger.warn(
            `Яндекс SpeechKit ответил ${response.status} при ${where}`,
            {
                phase,
                status: response.status,
                statusText: response.statusText,
                requestId,
                body: text.slice(0, 500),
            },
        );
        throw new YandexSttHttpError(
            response.status,
            requestId,
            phase,
            `Яндекс SpeechKit: HTTP ${response.status} ${response.statusText} при ${where}` +
                (requestId ? ` (requestId ${requestId})` : ''),
        );
    }

    /** Сдаёмся: ошибка постоянная или временных сбоев подряд больше терпимого. */
    private giveUp(error: unknown, failures: number): boolean {
        return (
            !isTransientYandexError(error) ||
            failures > this.tolerance.transientRetries
        );
    }

    private async backoff(
        failures: number,
        reason: string,
        context: Record<string, string>,
    ): Promise<void> {
        const delay = Math.min(
            this.tolerance.retryBaseMs * 2 ** (failures - 1),
            RETRY_MAX_MS,
        );
        this.logger.warn(
            `${reason} — повтор ${failures}/${this.tolerance.transientRetries} через ${delay} мс`,
            context,
        );
        await this.sleep(delay);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private numberSetting(key: string, fallback: number): number {
        const raw = this.configService.get<string>(key);
        const value = raw === undefined || raw === '' ? NaN : Number(raw);
        return Number.isFinite(value) && value >= 0 ? value : fallback;
    }
}
