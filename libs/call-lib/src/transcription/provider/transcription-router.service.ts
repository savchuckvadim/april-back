import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Semaphore, parseConcurrency } from '@lib/shared';
import { YandexStorageService } from '@lib/call-lib/yandex/yandex-storage.service';
import { StreamingTranscriptionService } from '../services/streaming-transcription.service';
import { VibeCodeClient, VibeKeyResolverService } from '@lib/vibecode';

export const TRANSCRIPTION_PROVIDERS = ['yandex', 'bitrix-vibecode'] as const;
export type TranscriptionProvider = (typeof TRANSCRIPTION_PROVIDERS)[number];

/** Режим выбора провайдера: auto — по длительности, иначе принудительно. */
export const TRANSCRIPTION_ROUTER_MODES = [
    'auto',
    'yandex',
    'vibecode',
] as const;
export type TranscriptionRouterMode =
    (typeof TRANSCRIPTION_ROUTER_MODES)[number];

export interface TranscribeCallInput {
    buffer: Buffer;
    fileName: string;
    domain: string;
    /** Длительность звонка в секундах (из voximplant) — основа маршрутизации. */
    durationSec?: number;
}

export interface TranscribeCallResult {
    text: string;
    provider: TranscriptionProvider;
}

/**
 * Маршрутизатор транскрибации: длинные звонки → Yandex SpeechKit
 * (надёжен на больших записях, но дорогой), короткие → Vibecode Whisper
 * (дёшево). Порог — env TRANSCRIPTION_YANDEX_MIN_SEC; режим можно
 * зафиксировать через TRANSCRIPTION_PROVIDER (auto|yandex|vibecode).
 *
 * При ошибке Vibecode выполняется одноразовый fallback на Yandex —
 * дорогой, но надёжный путь; обратного fallback нет (экономим бюджет).
 */
@Injectable()
export class TranscriptionRouterService {
    private readonly logger = new Logger(TranscriptionRouterService.name);
    private readonly mode: TranscriptionRouterMode;
    private readonly yandexMinSec: number;
    /**
     * Пер-провайдерные лимитеры одновременности: очередь call-report
     * обрабатывает несколько звонков параллельно, но каждый транскрибатор
     * держит не больше своего лимита одновременных запросов
     * (env TRANSCRIPTION_YANDEX_CONCURRENCY / TRANSCRIPTION_VIBECODE_CONCURRENCY).
     */
    private readonly yandexLimiter: Semaphore;
    private readonly vibecodeLimiter: Semaphore;

    constructor(
        private readonly configService: ConfigService,
        private readonly vibecode: VibeCodeClient,
        private readonly vibeKeyResolver: VibeKeyResolverService,
        private readonly yandexTranscription: StreamingTranscriptionService,
        private readonly yandexStorage: YandexStorageService,
    ) {
        const mode = this.configService.get<string>('TRANSCRIPTION_PROVIDER');
        this.mode = TRANSCRIPTION_ROUTER_MODES.includes(
            mode as TranscriptionRouterMode,
        )
            ? (mode as TranscriptionRouterMode)
            : 'auto';
        this.yandexMinSec = Number(
            this.configService.get<string>('TRANSCRIPTION_YANDEX_MIN_SEC') ??
                600,
        );
        this.yandexLimiter = new Semaphore(
            parseConcurrency(
                this.configService.get<string>(
                    'TRANSCRIPTION_YANDEX_CONCURRENCY',
                ),
                2,
            ),
        );
        this.vibecodeLimiter = new Semaphore(
            parseConcurrency(
                this.configService.get<string>(
                    'TRANSCRIPTION_VIBECODE_CONCURRENCY',
                ),
                3,
            ),
        );
    }

    async transcribe(
        input: TranscribeCallInput,
    ): Promise<TranscribeCallResult> {
        const provider = this.resolveProvider(input.durationSec);
        this.logger.log(
            `Транскрибация ${input.fileName} (${input.durationSec ?? '?'}с) через ${provider}`,
        );

        if (provider === 'yandex') {
            return {
                text: await this.transcribeYandex(input),
                provider: 'yandex',
            };
        }

        try {
            // Ключ VibeCode — пер-портальный (vibeKey из БД, env — fallback).
            const apiKey = await this.vibeKeyResolver.resolve(input.domain);
            const text = await this.vibecodeLimiter.run(() =>
                this.vibecode.transcribeAudio(
                    input.buffer,
                    input.fileName,
                    apiKey,
                ),
            );
            return { text, provider: 'bitrix-vibecode' };
        } catch (error) {
            this.logger.warn(
                `Vibecode не справился (${(error as Error).message}), fallback на Yandex`,
            );
            return {
                text: await this.transcribeYandex(input),
                provider: 'yandex',
            };
        }
    }

    private resolveProvider(durationSec?: number): TranscriptionProvider {
        if (this.mode === 'yandex') return 'yandex';
        if (this.mode === 'vibecode') return 'bitrix-vibecode';
        if (durationSec !== undefined && durationSec >= this.yandexMinSec) {
            return 'yandex';
        }
        return 'bitrix-vibecode';
    }

    /** Yandex-путь: буфер → S3 → longRunningRecognize → поллинг результата. */
    private async transcribeYandex(
        input: TranscribeCallInput,
    ): Promise<string> {
        return this.yandexLimiter.run(async () => {
            const s3Key = `transcription/audio/${input.domain}/call-report/${input.fileName}`;
            const fileUri = await this.yandexStorage.uploadFile(
                input.buffer,
                s3Key,
                'audio/mpeg',
            );
            const operationId =
                await this.yandexTranscription.transcribeAudio(fileUri);
            return this.yandexTranscription.getTranscriptionResult(operationId);
        });
    }
}
