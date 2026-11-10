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
import { YandexCallRecognizer } from './yandex-call-recognizer';
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
import {
    planTranscription,
    transcriptionStepName as stepName,
    type TranscriptionStep,
} from './transcription-route.util';

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

/**
 * Передавать ли звонок следующему после сбоя. Яндекс, стоящий ОСНОВНЫМ,
 * отдаёт звонок запасному только при временной ошибке (5xx, 429, сеть):
 * постоянная (403, битая запись) у запасного не исчезнет, а платить за
 * вторую попытку незачем. Во всех остальных случаях запасной подхватывает.
 */
const canFallBack = (
    step: TranscriptionStep,
    index: number,
    error: unknown,
): boolean =>
    step.provider !== 'yandex' || index > 0 || isTransientYandexError(error);

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
 *
 * Поверх режима — МАРШРУТ портала (10.11.2026): роли «длинные», «короткие»,
 * «запасные», «для скорости», «для точности» с моделью у каждой. Кого и в
 * каком порядке пробовать, считает чистая функция `planTranscription`
 * (она же в чек-листе админки); здесь план только исполняется.
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
    /** Yandex-путь: S3, число каналов по заголовку MP3, повтор по ответу Яндекса. */
    private readonly yandexRecognizer: YandexCallRecognizer;

    constructor(
        private readonly configService: ConfigService,
        private readonly vibecode: VibeCodeClient,
        private readonly vibeKeyResolver: VibeKeyResolverService,
        private readonly yandexTranscription: StreamingTranscriptionService,
        private readonly yandexStorage: YandexStorageService,
        private readonly whisper: WhisperCompatibleTranscriptionService,
        private readonly portalAiSettings: PortalAiSettingsService,
    ) {
        this.yandexRecognizer = new YandexCallRecognizer(
            yandexStorage,
            yandexTranscription,
            this.logger,
        );
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
        const { steps } = planTranscription({
            durationSec: input.durationSec,
            mode: prefs.mode,
            route: prefs.route,
            defaultLongMinSec: this.yandexMinSec,
            whisperConfigured: prefs.whisper !== null,
        });
        this.logger.log(
            `Транскрибация ${input.fileName} (${input.durationSec ?? '?'}с) через ${steps.map(stepName).join(' → ')}`,
        );

        for (const [index, step] of steps.entries()) {
            try {
                return await this.runStep(step, input, prefs);
            } catch (error) {
                const next = steps[index + 1];
                if (!next || !canFallBack(step, index, error)) throw error;
                this.logger.warn(
                    `${stepName(step)} не справился (${(error as Error).message}), fallback на ${stepName(next)}`,
                    { domain: input.domain, fileName: input.fileName },
                );
            }
        }
        // План не бывает пустым: у него всегда есть основной транскрибатор.
        throw new Error(`Нет транскрибатора для ${input.fileName}`);
    }

    /** Один шаг плана: транскрибатор с моделью роли или своей по умолчанию. */
    private async runStep(
        step: TranscriptionStep,
        input: TranscribeCallInput,
        prefs: TranscriptionPrefs,
    ): Promise<TranscribeCallResult> {
        if (step.provider === 'yandex') {
            return this.yandexResult(await this.transcribeYandex(input));
        }
        if (step.provider === 'bitrix-vibecode') {
            return this.transcribeVibecode(
                input,
                step.model ?? prefs.vibecodeModel,
            );
        }
        const endpoint =
            prefs.whisper && step.model
                ? { ...prefs.whisper, model: step.model }
                : prefs.whisper;
        return this.transcribeWhisper(input, endpoint);
    }

    /**
     * Настройки портала поверх env: режим транскрибации и свой Whisper.
     * Нет строки или ошибка чтения — общие значения приложения.
     */
    private async portalPrefs(domain: string): Promise<TranscriptionPrefs> {
        // Общий Whisper-endpoint приложения читается при каждом звонке: ключ
        // Groq из админки (настройки вендора) действует без перезапуска.
        const whisper = await this.whisper.envSettings();
        const env: TranscriptionEnvPrefs = {
            mode: this.mode,
            whisper: whisper.endpoint,
            defaultWhisperModel: whisper.defaultModel,
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
        model: string | null,
    ): Promise<TranscribeCallResult> {
        // Ключ VibeCode — пер-портальный (vibeKey из БД, env — fallback);
        // модель — из настроек AI портала, иначе константа клиента.
        const apiKey = await this.vibeKeyResolver.resolve(input.domain);
        const detailed = await this.vibecodeLimiter.run(() =>
            model === null
                ? this.vibecode.transcribeAudioDetailed(
                      input.buffer,
                      input.fileName,
                      apiKey,
                  )
                : this.vibecode.transcribeAudioDetailed(
                      input.buffer,
                      input.fileName,
                      apiKey,
                      model,
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

    /** Yandex-путь под лимитером: S3 → распознавание с числом каналов по MP3 (YandexCallRecognizer). */
    private async transcribeYandex(
        input: TranscribeCallInput,
    ): Promise<YandexTranscriptionDetailed> {
        return this.yandexLimiter.run(() =>
            this.yandexRecognizer.recognize(input),
        );
    }
}
