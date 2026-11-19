import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { YandexAuthService } from '@lib/call-lib/yandex/yandex-auth.service';
import {
    wordsToSegments,
    yandexSecondsOf,
    yandexWordsOf,
} from '../lib/segments.mapper';
import { detectStereoEcho } from '../lib/stereo-echo.util';
import {
    readYandexSttTolerance,
    yandexBackoffMs,
    type YandexSttTolerance,
} from '../lib/yandex-stt-budget.util';
import {
    isTransientYandexError,
    YandexOperationFailedError,
    YandexOperationPendingError,
    YandexSttHttpError,
    type YandexSttPhase,
} from '../lib/yandex-stt.errors';
import type { TranscriptSegment } from '../types/transcript-segment.types';

// Ошибки Яндекса живут в lib/yandex-stt.errors (их читает и страж
// отправок); ре-экспорт — чтобы потребители сервиса не меняли импорты.
export * from '../lib/yandex-stt.errors';

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

/** Каналов в записи для спецификации Яндекса: моно или стерео телефонии. */
export type YandexChannelCount = 1 | 2;

const CHANNEL_MISMATCH_RE = /Audio has (\d+) channels?, but (\d+) requested/i;

/**
 * Яндекс отверг запись из-за числа каналов («Audio has 2 channels, but 1
 * requested in specification») — сколько каналов в ней на самом деле;
 * другая ошибка или число вне 1–2 — null.
 */
export function channelsRequiredByYandex(
    error: unknown,
): YandexChannelCount | null {
    const match = CHANNEL_MISMATCH_RE.exec((error as Error)?.message ?? '');
    if (!match) return null;
    const actual = Number(match[1]);
    return actual === 1 || actual === 2 ? actual : null;
}

/**
 * Стерео: Яндекс отдаёт куски по каналам (сначала канал 1, затем 2) — для
 * связного текста куски выстраиваются по времени первого слова; моно и
 * куски без времени — в исходном порядке.
 */
export function orderChunksByTime(chunks: IYAChanks[]): IYAChanks[] {
    const channels = new Set(chunks.map(chunk => chunk.channelTag ?? '1'));
    if (channels.size < 2) return chunks;
    const starts = chunks.map(chunk => {
        const first = chunk.alternatives?.[0]?.words?.[0] as
            | { startTime?: unknown }
            | undefined;
        return yandexSecondsOf(first?.startTime);
    });
    if (starts.some(start => start === null)) return chunks;
    return chunks
        .map((chunk, index) => ({
            chunk,
            start: starts[index] as number,
            index,
        }))
        .sort((a, b) => a.start - b.start || a.index - b.index)
        .map(entry => entry.chunk);
}

/** requestId из тела ошибки Яндекса (details[].requestId). */
const extractRequestId = (body: string): string | null => {
    const match = body.match(/"requestId"\s*:\s*"([^"]+)"/);
    return match ? match[1] : null;
};

/**
 * Отправку повторяем, только если Яндекс ОТВЕТИЛ ошибкой (5xx, 429): по
 * такому ответу операции нет. Сетевой обрыв после отправки двусмыслен —
 * Яндекс мог принять запись и выставить счёт, повтор оплатил бы её второй
 * раз (19.11.2026: один звонок уходил в Яндекс по нескольку раз).
 */
const canResubmit = (error: unknown): boolean =>
    error instanceof YandexSttHttpError && error.status !== null;

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
        this.tolerance = readYandexSttTolerance(key =>
            this.configService.get<string>(key),
        );
    }

    /**
     * Отправка аудио на распознавание; повтор — только на ответ Яндекса
     * 5xx/429 (см. canResubmit). `channels` — число каналов записи (по
     * заголовку MP3, mp3ChannelCount): Яндекс отвергает запись, если оно не
     * совпадает со спецификацией.
     */
    async transcribeAudio(
        fileUri: string,
        channels: YandexChannelCount = 1,
    ): Promise<string> {
        const body = JSON.stringify({
            config: {
                folderId: this.folderId,
                specification: {
                    languageCode: 'ru-RU',
                    model: 'general',
                    profanityFilter: false,
                    audioEncoding: 'MP3',
                    sampleRateHertz: 48000,
                    audioChannelCount: channels,
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
                if (!canResubmit(error) || this.giveUp(error, failures)) {
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

        throw new YandexOperationPendingError(
            `Яндекс не завершил распознавание операции ${operationId} за отведённое время`,
        );
    }

    /** Разбор завершённой операции: ошибка Яндекса, пустой результат, текст. */
    private finished(
        operationId: string,
        data: IYAResponse,
    ): YandexTranscriptionDetailed {
        if (data.error) {
            throw new YandexOperationFailedError(
                `Яндекс завершил операцию ${operationId} ошибкой: ` +
                    `${data.error.code ?? '?'} ${data.error.message ?? ''}`.trim(),
            );
        }
        const chunks = this.transcriptChunks(
            operationId,
            data.response?.chunks ?? [],
        );
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
     * Куски для текста и сегментов. Стерео «двойное моно» (оба канала —
     * весь разговор, gsr 18.11.2026) — только один канал, иначе каждое
     * слово задвоится; раздельное стерео и моно — все куски по времени.
     */
    private transcriptChunks(
        operationId: string,
        chunks: IYAChanks[],
    ): IYAChanks[] {
        const echo = detectStereoEcho(yandexWordsOf(chunks));
        if (!echo) return orderChunksByTime(chunks);
        this.logger.log(
            `Стерео с одинаковыми каналами: оставлен канал ${echo.keepChannel}, ` +
                `совпало ${Math.round(echo.matchedShare * 100)} % слов (операция ${operationId})`,
        );
        return chunks.filter(chunk => chunk.channelTag === echo.keepChannel);
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
        const delay = yandexBackoffMs(this.tolerance, failures);
        this.logger.warn(
            `${reason} — повтор ${failures}/${this.tolerance.transientRetries} через ${delay} мс`,
            context,
        );
        await this.sleep(delay);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
