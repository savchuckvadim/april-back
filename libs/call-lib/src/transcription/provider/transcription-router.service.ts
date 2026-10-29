import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Semaphore, parseConcurrency } from '@lib/shared';
import { YandexStorageService } from '@lib/call-lib/yandex/yandex-storage.service';
import { whisperSegmentsOf } from '../lib/segments.mapper';
import {
    StreamingTranscriptionService,
    isTransientYandexError,
    type YandexTranscriptionDetailed,
} from '../services/streaming-transcription.service';
import {
    WhisperCompatibleTranscriptionService,
    type WhisperEndpoint,
} from '../services/whisper-compatible-transcription.service';
import type { TranscriptSegment } from '../types/transcript-segment.types';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import { VibeCodeClient, VibeKeyResolverService } from '@lib/vibecode';
import {
    parseTranscriptionRouterMode,
    type TranscriptionProvider,
    type TranscriptionRouterMode,
} from './transcription-provider.types';
import {
    resolveTranscriptionPrefs,
    type TranscriptionEnvPrefs,
    type TranscriptionPrefs,
} from './transcription-prefs.util';

// Коды провайдеров и режимов живут отдельно (их читает и чек-лист админки);
// ре-экспорт — чтобы потребители роутера не меняли импорты.
export * from './transcription-provider.types';

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
    /** Сегменты с таймкодами (П6); null — провайдер их не дал. */
    segments: TranscriptSegment[] | null;
}

/** Пустой список сегментов в БД не пишем — null, как у старых строк. */
const nonEmpty = (
    segments: readonly TranscriptSegment[],
): TranscriptSegment[] | null => (segments.length ? [...segments] : null);

/**
 * Маршрутизатор транскрибации: длинные звонки → Yandex SpeechKit
 * (надёжен на больших записях, но дорогой), короткие → Vibecode Whisper
 * (дёшево). Порог — env TRANSCRIPTION_YANDEX_MIN_SEC; режим можно
 * зафиксировать через TRANSCRIPTION_PROVIDER (auto|yandex|vibecode).
 *
 * При ошибке Vibecode выполняется одноразовый fallback на Yandex —
 * дорогой, но надёжный путь. При ВРЕМЕННОЙ ошибке Yandex (5xx/429/сеть,
 * после его собственных повторов) в auto-режиме — одноразовый fallback на
 * Vibecode: длинную запись он может не вытянуть, но это лучше, чем терять
 * звонок до следующего догона (ночь 28.10.2026: Яндекс отдавал 500, ~25
 * звонков gsr остались без разбора). В принудительных режимах fallback
 * на Vibecode нет.
 *
 * Третий транскрибатор — свой Whisper (OpenAI-совместимый endpoint, env
 * TRANSCRIPTION_WHISPER_BASE_URL): последний резерв, когда Яндекс и Vibecode
 * отказали оба, либо основной при TRANSCRIPTION_PROVIDER=whisper (без
 * запасных путей, как у yandex); не настроен — в маршрутах его нет (план
 * устойчивости к провайдерам 28.10.2026).
 *
 * Настройки портала важнее env: `transcriptionMode` и свой Whisper
 * (`whisperBaseUrl / whisperModel / whisperApiKey`) из настроек AI портала
 * (админка) — так клиент может считать на своём сервере и платить сам;
 * ошибка чтения настроек — общие значения приложения (29.10.2026).
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
    /** Свой Whisper — обычно один GPU: по умолчанию одна запись за раз. */
    private readonly whisperLimiter: Semaphore;

    constructor(
        private readonly configService: ConfigService,
        private readonly vibecode: VibeCodeClient,
        private readonly vibeKeyResolver: VibeKeyResolverService,
        private readonly yandexTranscription: StreamingTranscriptionService,
        private readonly yandexStorage: YandexStorageService,
        private readonly whisper: WhisperCompatibleTranscriptionService,
        private readonly portalAiSettings: PortalAiSettingsService,
    ) {
        this.whisperLimiter = new Semaphore(
            parseConcurrency(
                this.configService.get<string>(
                    'TRANSCRIPTION_WHISPER_CONCURRENCY',
                ),
                1,
            ),
        );
        this.mode = parseTranscriptionRouterMode(
            this.configService.get<string>('TRANSCRIPTION_PROVIDER'),
        );
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
        const prefs = await this.portalPrefs(input.domain);
        const provider = this.resolveProvider(input.durationSec, prefs.mode);
        this.logger.log(
            `Транскрибация ${input.fileName} (${input.durationSec ?? '?'}с) через ${provider}`,
        );

        // Принудительный свой Whisper — без запасных путей (как у yandex).
        if (provider === 'local-whisper') {
            return this.transcribeWhisper(input, prefs.whisper);
        }

        if (provider === 'yandex') {
            try {
                return this.yandexResult(await this.transcribeYandex(input));
            } catch (error) {
                if (prefs.mode !== 'auto' || !isTransientYandexError(error)) {
                    throw error;
                }
                this.logger.warn(
                    `Yandex временно недоступен (${(error as Error).message}), fallback на Vibecode`,
                    { domain: input.domain, fileName: input.fileName },
                );
                return this.vibecodeThenWhisper(input, prefs.whisper);
            }
        }

        try {
            return await this.transcribeVibecode(input);
        } catch (error) {
            this.logger.warn(
                `Vibecode не справился (${(error as Error).message}), fallback на Yandex`,
            );
            try {
                return this.yandexResult(await this.transcribeYandex(input));
            } catch (yandexError) {
                if (!prefs.whisper) throw yandexError;
                this.logger.warn(
                    `Yandex тоже не справился (${(yandexError as Error).message}), fallback на свой Whisper`,
                    { domain: input.domain, fileName: input.fileName },
                );
                return this.transcribeWhisper(input, prefs.whisper);
            }
        }
    }

    /**
     * Настройки портала поверх env: режим транскрибации и свой Whisper.
     * Нет строки или ошибка чтения — общие значения приложения.
     */
    private async portalPrefs(domain: string): Promise<TranscriptionPrefs> {
        const env: TranscriptionEnvPrefs = {
            mode: this.mode,
            whisper: this.whisper.envEndpoint,
            defaultWhisperModel: this.whisper.defaultModel,
        };
        try {
            const record = await this.portalAiSettings.getByDomain(domain);
            return resolveTranscriptionPrefs(record, env);
        } catch (error) {
            this.logger.warn(
                `Настройки транскрибации портала ${domain} не прочитаны (${(error as Error).message}) — общие`,
            );
            return resolveTranscriptionPrefs(null, env);
        }
    }

    /** Vibecode, а если и он отказал — свой Whisper (когда есть endpoint). */
    private async vibecodeThenWhisper(
        input: TranscribeCallInput,
        whisper: WhisperEndpoint | null,
    ): Promise<TranscribeCallResult> {
        try {
            return await this.transcribeVibecode(input);
        } catch (error) {
            if (!whisper) throw error;
            this.logger.warn(
                `Vibecode тоже не справился (${(error as Error).message}), fallback на свой Whisper`,
                { domain: input.domain, fileName: input.fileName },
            );
            return this.transcribeWhisper(input, whisper);
        }
    }

    /** Свой Whisper: буфер → OpenAI-совместимый /audio/transcriptions портала или общий. */
    private async transcribeWhisper(
        input: TranscribeCallInput,
        endpoint: WhisperEndpoint | null,
    ): Promise<TranscribeCallResult> {
        const detailed = await this.whisperLimiter.run(() =>
            this.whisper.transcribeDetailed(
                input.buffer,
                input.fileName,
                endpoint,
            ),
        );
        return {
            text: detailed.text,
            provider: 'local-whisper',
            segments: nonEmpty(whisperSegmentsOf(detailed.segments)),
        };
    }

    /** Vibecode-путь: буфер напрямую в Whisper с пер-портальным ключом. */
    private async transcribeVibecode(
        input: TranscribeCallInput,
    ): Promise<TranscribeCallResult> {
        // Ключ VibeCode — пер-портальный (vibeKey из БД, env — fallback).
        const apiKey = await this.vibeKeyResolver.resolve(input.domain);
        const detailed = await this.vibecodeLimiter.run(() =>
            this.vibecode.transcribeAudioDetailed(
                input.buffer,
                input.fileName,
                apiKey,
            ),
        );
        return {
            text: detailed.text,
            provider: 'bitrix-vibecode',
            segments: nonEmpty(whisperSegmentsOf(detailed.segments)),
        };
    }

    private yandexResult(
        detailed: YandexTranscriptionDetailed,
    ): TranscribeCallResult {
        return {
            text: detailed.text,
            provider: 'yandex',
            segments: nonEmpty(detailed.segments),
        };
    }

    private resolveProvider(
        durationSec: number | undefined,
        mode: TranscriptionRouterMode,
    ): TranscriptionProvider {
        if (mode === 'yandex') return 'yandex';
        if (mode === 'vibecode') return 'bitrix-vibecode';
        if (mode === 'whisper') return 'local-whisper';
        if (durationSec !== undefined && durationSec >= this.yandexMinSec) {
            return 'yandex';
        }
        return 'bitrix-vibecode';
    }

    /** Yandex-путь: буфер → S3 → longRunningRecognize → поллинг результата. */
    private async transcribeYandex(
        input: TranscribeCallInput,
    ): Promise<YandexTranscriptionDetailed> {
        return this.yandexLimiter.run(async () => {
            const s3Key = `transcription/audio/${input.domain}/call-report/${input.fileName}`;
            const fileUri = await this.yandexStorage.uploadFile(
                input.buffer,
                s3Key,
                'audio/mpeg',
            );
            const operationId =
                await this.yandexTranscription.transcribeAudio(fileUri);
            return this.yandexTranscription.getTranscriptionDetailed(
                operationId,
            );
        });
    }
}
