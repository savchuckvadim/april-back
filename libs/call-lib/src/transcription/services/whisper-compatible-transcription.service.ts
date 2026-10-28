import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Текст и сырые сегменты verbose_json; segments null — сервер их не дал. */
export interface WhisperTranscriptionDetailed {
    text: string;
    segments: unknown;
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
 * РФ-облаке). Включается env TRANSCRIPTION_WHISPER_BASE_URL — без него
 * роутер провайдера не видит. Последний резерв, когда Яндекс и VibeCode
 * отказали оба, либо основной при TRANSCRIPTION_PROVIDER=whisper
 * (план устойчивости к провайдерам, 28.10.2026).
 */
@Injectable()
export class WhisperCompatibleTranscriptionService {
    private readonly logger = new Logger(
        WhisperCompatibleTranscriptionService.name,
    );
    private readonly baseUrl: string | null;
    private readonly apiKey: string | null;
    private readonly model: string;
    private readonly language: string;
    private readonly timeoutMs: number;

    constructor(configService: ConfigService) {
        const url = (
            configService.get<string>('TRANSCRIPTION_WHISPER_BASE_URL') ?? ''
        )
            .trim()
            .replace(/\/+$/, '');
        this.baseUrl = url || null;
        this.apiKey =
            (
                configService.get<string>('TRANSCRIPTION_WHISPER_API_KEY') ?? ''
            ).trim() || null;
        this.model =
            (
                configService.get<string>('TRANSCRIPTION_WHISPER_MODEL') ?? ''
            ).trim() || DEFAULT_MODEL;
        this.language =
            (
                configService.get<string>('TRANSCRIPTION_WHISPER_LANGUAGE') ??
                ''
            ).trim() || DEFAULT_LANGUAGE;
        const timeout = Number(
            configService.get<string>('TRANSCRIPTION_WHISPER_TIMEOUT_MS') ??
                NaN,
        );
        this.timeoutMs =
            Number.isFinite(timeout) && timeout > 0
                ? timeout
                : DEFAULT_TIMEOUT_MS;
    }

    /** Endpoint задан — провайдер участвует в маршрутизации. */
    get configured(): boolean {
        return this.baseUrl !== null;
    }

    /** Транскрибация с сегментами; сервер без verbose_json — повтор без них. */
    async transcribeDetailed(
        buffer: Buffer,
        fileName: string,
    ): Promise<WhisperTranscriptionDetailed> {
        try {
            return await this.post(buffer, fileName, 'verbose_json');
        } catch (error) {
            if (!isClientError(error)) throw error;
            this.logger.warn(
                `verbose_json не принят (${(error as Error).message}) — повтор без сегментов`,
            );
            return this.post(buffer, fileName, null);
        }
    }

    private async post(
        buffer: Buffer,
        fileName: string,
        responseFormat: 'verbose_json' | null,
    ): Promise<WhisperTranscriptionDetailed> {
        if (!this.baseUrl) {
            throw new Error(
                'Свой Whisper не настроен: нет TRANSCRIPTION_WHISPER_BASE_URL',
            );
        }
        const where = `Whisper (${this.model})`;
        const formData = new FormData();
        formData.append('model', this.model);
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
            response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
                method: 'POST',
                headers: this.apiKey
                    ? { Authorization: `Bearer ${this.apiKey}` }
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
