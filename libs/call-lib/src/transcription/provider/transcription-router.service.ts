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
import { readYandexSlotWaitMs } from '../lib/yandex-stt-budget.util';
import { ChunkedTranscriptionService } from '../chunking/chunked-transcription.service';
import { TranscriptionChunkingSettingsService } from '../chunking/transcription-chunking-settings.service';
import { ChunkedRouteRunner } from './chunked-route-runner';
import type {
    TranscribeCallInput,
    TranscribeCallResult,
} from './transcription-call.types';
import { YandexCallRecognizer } from './yandex-call-recognizer';
import {
    transcriptionCallKey,
    yandexBufferInput,
} from './yandex-call-input.util';
import { YandexSlot } from './yandex-slot';
import { YandexSubmissionGuard } from './yandex-submission-guard.service';
import { TranscriptionSegmentsWatch } from './transcription-segments-watch';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import { VibeCodeClient, VibeKeyResolverService } from '@lib/vibecode';
import {
    parseTranscriptionRouterMode,
    type TranscriptionRouterMode,
} from './transcription-provider.types';
import {
    resolveTranscriptionPrefs,
    type TranscriptionEnvPrefs,
    type TranscriptionPrefs,
} from './transcription-prefs.util';
import {
    isLongTranscriptionCall,
    planTranscription,
    transcriptionStepName as stepName,
    type TranscriptionStep,
} from './transcription-route.util';

// Коды провайдеров и режимов, вход и итог звонка живут отдельно (их читают
// чек-лист админки и резка длинных звонков); ре-экспорт — чтобы потребители
// роутера не меняли импорты.
export * from './transcription-provider.types';
export * from './transcription-call.types';

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
 * (надёжен на больших записях, но дорогой), короткие → VibeCode
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
 *
 * Длинный звонок при включённой резке портала (19.11.2026) идёт кусками:
 * роутер только решает «резать или нет», куски ведёт ChunkedRouteRunner —
 * шагами этого же плана, бесплатные первыми, Яндекс последним.
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
     * (env TRANSCRIPTION_VIBECODE_CONCURRENCY; у Яндекса — YandexSlot с
     * TRANSCRIPTION_YANDEX_CONCURRENCY и пределом ожидания слота).
     */
    private readonly vibecodeLimiter: Semaphore;
    /** Свой Whisper — обычно один GPU: по умолчанию одна запись за раз. */
    private readonly whisperLimiter: Semaphore;
    /**
     * Yandex-путь: замок и лимит стража, слот процесса с пределом ожидания,
     * S3, число каналов по заголовку MP3, повтор по ответу Яндекса.
     */
    private readonly yandexRecognizer: YandexCallRecognizer;
    /** Текст без таймкодов — в журнал и раз в час в телеграм. */
    private readonly segmentsWatch = new TranscriptionSegmentsWatch(
        this.logger,
    );
    /** Длинный звонок кусками через шаги плана. */
    private readonly chunkedRunner: ChunkedRouteRunner;

    constructor(
        private readonly configService: ConfigService,
        private readonly vibecode: VibeCodeClient,
        private readonly vibeKeyResolver: VibeKeyResolverService,
        private readonly yandexTranscription: StreamingTranscriptionService,
        private readonly yandexStorage: YandexStorageService,
        private readonly whisper: WhisperCompatibleTranscriptionService,
        private readonly portalAiSettings: PortalAiSettingsService,
        yandexGuard: YandexSubmissionGuard,
        private readonly chunkingSettings: TranscriptionChunkingSettingsService,
        chunked: ChunkedTranscriptionService,
    ) {
        this.chunkedRunner = new ChunkedRouteRunner({
            chunked,
            guard: yandexGuard,
            segmentsWatch: this.segmentsWatch,
            logger: this.logger,
        });
        this.yandexRecognizer = new YandexCallRecognizer({
            storage: yandexStorage,
            yandex: yandexTranscription,
            guard: yandexGuard,
            logger: this.logger,
            slot: new YandexSlot(
                parseConcurrency(
                    this.configService.get<string>(
                        'TRANSCRIPTION_YANDEX_CONCURRENCY',
                    ),
                    2,
                ),
                readYandexSlotWaitMs(key =>
                    this.configService.get<string>(key),
                ),
            ),
        });
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
        const chunked = await this.transcribeChunked(input, steps, prefs);
        return chunked ?? this.runPlan(input, steps, prefs);
    }

    /**
     * Длинный звонок при включённой резке портала — кусками. null — резка не
     * применяется (короткий звонок, резка выключена, не MP3, нет бесплатного
     * распознавателя): звонок целиком идёт планом. Ошибка куска пробрасывается
     * как ошибка звонка — без Яндекса на весь звонок: повтор продолжит куски.
     */
    private async transcribeChunked(
        input: TranscribeCallInput,
        steps: readonly TranscriptionStep[],
        prefs: TranscriptionPrefs,
    ): Promise<TranscribeCallResult | null> {
        const long = isLongTranscriptionCall(
            input.durationSec,
            prefs.route,
            this.yandexMinSec,
        );
        if (!long) return null;
        const settings = await this.chunkingSettings.resolve(input.domain);
        if (!settings.enabled) return null;
        return this.chunkedRunner.run({
            call: input,
            callKey: transcriptionCallKey(input),
            steps,
            whisperConfigured: prefs.whisper !== null,
            settings,
            runStep: (step, part) => this.runStep(step, part, prefs),
        });
    }

    /** Звонок целиком: шаги плана по очереди, запасной — по правилам canFallBack. */
    private async runPlan(
        input: TranscribeCallInput,
        steps: readonly TranscriptionStep[],
        prefs: TranscriptionPrefs,
    ): Promise<TranscribeCallResult> {
        for (const [index, step] of steps.entries()) {
            try {
                const result = await this.runStep(step, input, prefs);
                if (result.segments === null && result.text.trim() !== '') {
                    this.segmentsWatch.report({
                        domain: input.domain,
                        stepName: stepName(step),
                        fileName: input.fileName,
                    });
                }
                return result;
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

    /** Vibecode-путь: буфер напрямую в VibeCode с пер-портальным ключом. */
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

    /** Yandex-путь: страж, слот, S3 и распознавание (YandexCallRecognizer). */
    private async transcribeYandex(
        input: TranscribeCallInput,
    ): Promise<YandexTranscriptionDetailed> {
        return this.yandexRecognizer.recognize(
            yandexBufferInput(input, this.yandexStorage),
        );
    }
}
