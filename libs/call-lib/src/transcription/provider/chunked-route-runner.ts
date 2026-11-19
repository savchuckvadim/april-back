import type { Logger } from '@nestjs/common';
import type { ChunkedTranscriptionService } from '../chunking/chunked-transcription.service';
import type {
    ChunkAttempt,
    ChunkInfo,
} from '../chunking/chunked-transcription.types';
import type { TranscriptionChunkingPlan } from '../chunking/transcription-chunking-settings.service';
import {
    chunkAttemptSteps,
    chunkCallKey,
    chunkProvidersLine,
    dominantChunkProvider,
} from './chunked-route.util';
import type {
    TranscribeCallInput,
    TranscribeCallResult,
} from './transcription-call.types';
import {
    transcriptionStepName as stepName,
    type TranscriptionStep,
} from './transcription-route.util';
import type { TranscriptionSegmentsWatch } from './transcription-segments-watch';
import type { YandexSubmissionGuard } from './yandex-submission-guard.service';

/** Шаг плана в исполнении роутера — с его лимитерами, ключами и моделью. */
export type RunTranscriptionStep = (
    step: TranscriptionStep,
    call: TranscribeCallInput,
) => Promise<TranscribeCallResult>;

export interface ChunkedRouteDeps {
    chunked: Pick<ChunkedTranscriptionService, 'transcribeChunked'>;
    /** Замок звонка стража Яндекса — один запуск звонка за раз. */
    guard: Pick<YandexSubmissionGuard, 'withCallLock'>;
    segmentsWatch: Pick<TranscriptionSegmentsWatch, 'report'>;
    logger: Pick<Logger, 'log'>;
}

export interface ChunkedRouteInput {
    call: TranscribeCallInput;
    /** Ключ звонка: dedupKey конвейера или хэш записи. */
    callKey: string;
    /** План распознавания звонка целиком — из него берутся попытки на кусок. */
    steps: readonly TranscriptionStep[];
    whisperConfigured: boolean;
    settings: TranscriptionChunkingPlan;
    runStep: RunTranscriptionStep;
}

/**
 * Длинный звонок кусками через шаги маршрута (19.11.2026: длинные звонки
 * целиком уходили в платный Яндекс). Роутер решает «резать или нет», здесь —
 * как: попытки на кусок из плана (бесплатные первыми, Яндекс последним),
 * каждая — обычный шаг роутера с буфером, именем и длительностью куска и
 * ключом куска для стража Яндекса, итог — обычный результат распознавания.
 *
 * Весь прогон — под замком звонка стража: второй запуск того же звонка
 * (ретрай Bull рядом с живым первым, повторный скан) получает «уже идёт», а
 * не распознаёт куски второй раз.
 *
 * Не Injectable: зависимости аргументами, держит роутер.
 */
export class ChunkedRouteRunner {
    constructor(private readonly deps: ChunkedRouteDeps) {}

    /**
     * null — резать нельзя или незачем (не MP3, в маршруте нет бесплатного
     * распознавателя): звонок целиком идёт прежним путём.
     */
    async run(input: ChunkedRouteInput): Promise<TranscribeCallResult | null> {
        const { callKey, call, settings } = input;
        const steps = chunkAttemptSteps(input.steps, input.whisperConfigured);
        if (steps.length === 0) {
            this.deps.logger.log(
                `Звонок ${callKey}: резка включена, но в маршруте нет бесплатного распознавателя — звонок целиком прежним путём`,
            );
            return null;
        }
        this.deps.logger.log(
            `Звонок ${callKey}: резка включена — куски по ${settings.chunkSec} с, ` +
                `по ${settings.parallel} одновременно, на кусок: ${steps.map(stepName).join(' → ')}`,
        );
        const ref = {
            key: callKey,
            domain: call.domain,
            label: `${callKey} (${call.fileName})`,
            durationSec: call.durationSec,
        };
        return this.deps.guard.withCallLock(ref, () =>
            this.runLocked(input, steps),
        );
    }

    private async runLocked(
        input: ChunkedRouteInput,
        steps: readonly TranscriptionStep[],
    ): Promise<TranscribeCallResult | null> {
        const { callKey, call, settings } = input;
        const untimed = new Set<string>();
        const result = await this.deps.chunked.transcribeChunked({
            callKey,
            audio: call.buffer,
            fileName: call.fileName,
            chunkSec: settings.chunkSec,
            overlapSec: settings.overlapSec,
            parallel: settings.parallel,
            attempts: steps.map(step => this.attempt(step, input, untimed)),
        });
        if (!result) return null;

        const provider = dominantChunkProvider(result.providerSeconds, steps);
        this.deps.logger.log(
            `Звонок ${callKey}: резка включена, ${result.chunks} кусков по ${settings.chunkSec} с, ` +
                `распознали: ${chunkProvidersLine(result.providers)}; в расшифровку — ${provider} (больше всего секунд)`,
        );
        if (result.untimed) {
            const names = untimed.size
                ? [...untimed]
                : Object.keys(result.providers).slice(0, 1);
            for (const name of names) {
                this.deps.segmentsWatch.report({
                    domain: call.domain,
                    stepName: name,
                    fileName: call.fileName,
                });
            }
        }
        return { text: result.text, provider, segments: result.segments };
    }

    /** Попытка на кусок — шаг роутера с куском вместо записи. */
    private attempt(
        step: TranscriptionStep,
        input: ChunkedRouteInput,
        untimed: Set<string>,
    ): ChunkAttempt {
        const name = stepName(step);
        return {
            provider: name,
            transcribe: async (
                chunk: Buffer,
                fileName: string,
                info: ChunkInfo,
            ) => {
                const recognized = await input.runStep(step, {
                    buffer: chunk,
                    fileName,
                    domain: input.call.domain,
                    // Длительность куска: её страж пишет в счётчик отправок в Яндекс.
                    durationSec: Math.max(
                        1,
                        Math.round(info.endSec - info.startSec),
                    ),
                    callKey: chunkCallKey(input.callKey, info),
                });
                if (
                    recognized.segments === null &&
                    recognized.text.trim() !== ''
                ) {
                    untimed.add(name);
                }
                return { text: recognized.text, segments: recognized.segments };
            },
        };
    }
}
