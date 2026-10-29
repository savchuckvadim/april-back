import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Текст и сырые сегменты verbose_json; segments null — сервер их не дал. */
export interface WhisperTranscriptionDetailed {
    text: string;
    segments: unknown;
}

/** Куда слать запись: адрес без хвостового слэша, ключ (null — без авторизации), модель. */
export interface WhisperEndpoint {
    baseUrl: string;
    apiKey: string | null;
    model: string;
}

interface WhisperResponse {
    text?: string;
    segments?: unknown;
}

const DEFAULT_MODEL = 'Systran/faster-whisper-large-v3';
const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_LANGUAGE = 'ru';

/** Ответ 4xx на verbose_json — формат не поддержан, повторяем без него (как у VibeCode). */
const isClientError = (error: unknown): boolean =>
    /\[4\d\d\]/.test((error as Error)?.message ?? '');

/**
 * Третий транскрибатор: любой OpenAI-совместимый `/audio/transcriptions`
 * (faster-whisper-server, speaches, vLLM-whisper на своём GPU или в
 * РФ-облаке). Общий endpoint приложения — env TRANSCRIPTION_WHISPER_BASE_URL
 * (без него роутер провайдера не видит); у портала может быть свой —
 * роутер передаёт его параметром (настройки AI портала: whisperBaseUrl /
 * whisperModel / whisperApiKey). Последний резерв, когда Яндекс и VibeCode
 * отказали оба, либо основной при режиме whisper (план устойчивости к
 * провайдерам, 28–29.10.2026).
 */
@Injectable()
export class WhisperCompatibleTranscriptionService {
    private readonly logger = new Logger(
        WhisperCompatibleTranscriptionService.name,
    );
    /** Общий endpoint приложения из env; null — не задан. */
    readonly envEndpoint: WhisperEndpoint | null;
    /** Модель по умолчанию — для портала, задавшего только адрес. */
    readonly defaultModel: string;
    private readonly language: string;
    private readonly timeoutMs: number;

    constructor(configService: ConfigService) {
        const read = (key: string): string =>
            (configService.get<string>(key) ?? '').trim();
        this.defaultModel =
            read('TRANSCRIPTION_WHISPER_MODEL') || DEFAULT_MODEL;
        const baseUrl = read('TRANSCRIPTION_WHISPER_BASE_URL').replace(
            /\/+$/,
            '',
        );
        this.envEndpoint = baseUrl
            ? {
                  baseUrl,
                  apiKey: read('TRANSCRIPTION_WHISPER_API_KEY') || null,
                  model: this.defaultModel,
              }
            : null;
        this.language =
            read('TRANSCRIPTION_WHISPER_LANGUAGE') || DEFAULT_LANGUAGE;
        const timeout = Number(read('TRANSCRIPTION_WHISPER_TIMEOUT_MS') || NaN);
        this.timeoutMs =
            Number.isFinite(timeout) && timeout > 0
                ? timeout
                : DEFAULT_TIMEOUT_MS;
    }

    /** Общий endpoint задан — провайдер участвует в маршрутизации у всех порталов. */
    get configured(): boolean {
        return this.envEndpoint !== null;
    }

    /**
     * Транскрибация с сегментами; сервер без verbose_json — повтор без них.
     * `endpoint` — свой Whisper портала; не передан — общий из env.
     */
    async transcribeDetailed(
        buffer: Buffer,
        fileName: string,
        endpoint: WhisperEndpoint | null = this.envEndpoint,
    ): Promise<WhisperTranscriptionDetailed> {
        if (!endpoint) {
            throw new Error(
                'Свой Whisper не настроен: нет TRANSCRIPTION_WHISPER_BASE_URL и адреса у портала',
            );
        }
        try {
            return await this.post(buffer, fileName, 'verbose_json', endpoint);
        } catch (error) {
            if (!isClientError(error)) throw error;
            this.logger.warn(
                `verbose_json не принят (${(error as Error).message}) — повтор без сегментов`,
            );
            return this.post(buffer, fileName, null, endpoint);
        }
    }

    private async post(
        buffer: Buffer,
        fileName: string,
        responseFormat: 'verbose_json' | null,
        endpoint: WhisperEndpoint,
    ): Promise<WhisperTranscriptionDetailed> {
        const where = `Whisper (${endpoint.model})`;
        const formData = new FormData();
        formData.append('model', endpoint.model);
        formData.append('language', this.language);
        if (responseFormat !== null) {
            formData.append('response_format', responseFormat);
        }
        formData.append(
            'file',
            new Blob([buffer], { type: 'audio/mpeg' }),
            fileName,
        );

        let response: Response;
        try {
            response = await fetch(`${endpoint.baseUrl}/audio/transcriptions`, {
                method: 'POST',
                headers: endpoint.apiKey
                    ? { Authorization: `Bearer ${endpoint.apiKey}` }
                    : {},
                body: formData,
                signal: AbortSignal.timeout(this.timeoutMs),
            });
        } catch (error) {
            throw new Error(
                `${where}: сеть или таймаут — ${(error as Error).message}`,
            );
        }
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(
                `${where} failed [${response.status}]: ${text.slice(0, 500)}`,
            );
        }
        const data = (await response.json()) as WhisperResponse;
        if (!data.text) throw new Error(`${where}: пустая расшифровка`);
        this.logger.log(`${where}: ${fileName} → ${data.text.length} знаков`);
        return { text: data.text, segments: data.segments ?? null };
    }
}
