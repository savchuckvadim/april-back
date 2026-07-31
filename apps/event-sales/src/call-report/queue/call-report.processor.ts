import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { buildDedupKey, CallReportBaseItemService } from '@lib/call-lib';
import {
    CallReportAnalyzeStagePayload,
    CallReportJobPayload,
    CallReportPipelineUseCase,
} from '../use-cases/call-report-pipeline.use-case';

/**
 * Concurrency стадий читается на этапе декорации класса, поэтому только
 * из process.env:
 * - CALL_REPORT_CONCURRENCY — стадия TRANSCRIBE (default 3);
 * - CALL_REPORT_ANALYZE_CONCURRENCY — стадия ANALYZE (default 2).
 * Пер-провайдерные лимитеры (Yandex/VibeCode/GigaChat) держат внешние
 * сервисы в рамках независимо от этих значений.
 */
function resolveConcurrency(envName: string, fallback: number): number {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

/** Опции джоба стадии анализа (ретраи как у транскрибации). */
const ANALYZE_JOB_OPTS = {
    attempts: 2,
    backoff: { type: 'fixed', delay: 60_000 },
    removeOnComplete: true,
    removeOnFail: true,
};

/**
 * Воркер очереди CALL_REPORT, две стадии отдельными джобами:
 *
 * 1. TRANSCRIBE (аудио → текст) — по завершении ставит джоб ANALYZE;
 * 2. ANALYZE (классификация + LLM + персист + таймлайн).
 *
 * Так транскрибация звонка N+1 идёт параллельно с анализом звонка N —
 * конвейер не простаивает на самой долгой операции.
 *
 * Обратная совместимость: джоб ANALYZE без transcriptionId (поставлен
 * кодом до разбивки на стадии) прогоняется целиком через execute().
 *
 * Ошибка пробрасывается в Bull для ретрая; Telegram-алерт — только на
 * последней попытке ({ telegram: true } — транспорт логгера).
 */
@Processor(QueueNames.CALL_REPORT)
export class CallReportProcessor {
    private readonly logger = new Logger(CallReportProcessor.name);

    constructor(
        private readonly pipeline: CallReportPipelineUseCase,
        private readonly queueDispatcher: QueueDispatcherService,
        private readonly baseItem: CallReportBaseItemService,
    ) {}

    @Process({
        name: JobNames.CALL_REPORT_TRANSCRIBE,
        concurrency: resolveConcurrency('CALL_REPORT_CONCURRENCY', 3),
    })
    async handleTranscribe(job: Job<CallReportJobPayload>): Promise<void> {
        const { domain, activityId } = job.data;
        this.logger.log(
            `TRANSCRIBE: ${domain}, activity ${activityId} (job ${job.id})`,
        );
        try {
            const result = await this.pipeline.executeTranscribe(job.data);
            await this.dispatchAnalyze(job.data, result.transcriptionId);
        } catch (error) {
            this.reportFailure('TRANSCRIBE', job, error as Error);
            throw error;
        }
    }

    @Process({
        name: JobNames.CALL_REPORT_ANALYZE,
        concurrency: resolveConcurrency('CALL_REPORT_ANALYZE_CONCURRENCY', 2),
    })
    async handleAnalyze(
        job: Job<CallReportAnalyzeStagePayload | CallReportJobPayload>,
    ): Promise<void> {
        const { domain, activityId } = job.data;
        this.logger.log(
            `ANALYZE: ${domain}, activity ${activityId} (job ${job.id})`,
        );
        try {
            // Легаси-джоб без transcriptionId (поставлен до разбивки на
            // стадии) — прогоняем весь конвейер целиком.
            const result =
                'transcriptionId' in job.data && job.data.transcriptionId
                    ? await this.pipeline.executeAnalyze(job.data)
                    : await this.pipeline.execute(job.data);
            this.logger.log(
                `Звонок обработан: transcription ${result.transcriptionId}, ` +
                    `provider ${result.provider}, callType=${result.callType ?? '—'}, ` +
                    `resume=${result.resumeSaved}, recomendation=${result.recomendationSaved}`,
            );
            if (job.data.createSmartItem) {
                await this.createSmartItem(
                    result.transcriptionId,
                    result.callType,
                    job.data,
                );
            }
        } catch (error) {
            this.reportFailure('ANALYZE', job, error as Error);
            throw error;
        }
    }

    /**
     * Базовый элемент смарта после анализа. Ошибка НЕ роняет джоб:
     * транскрипт и ais-записи уже сохранены, повторный прогон стоил бы
     * бюджета транскрибации. Элемент дольётся ретраем скана или глубоким
     * анализом — writer работает upsert-ом по xmlId.
     */
    private async createSmartItem(
        transcriptionId: string,
        callType: string | null,
        payload: CallReportJobPayload,
    ): Promise<void> {
        try {
            const itemId = await this.baseItem.createBaseItem(
                transcriptionId,
                callType,
            );
            this.logger.log(
                itemId
                    ? `Смарт-элемент ${itemId} (transcription ${transcriptionId})`
                    : `Смарт не установлен на ${payload.domain} — элемент не создан`,
            );
        } catch (error) {
            this.logger.warn(
                `Смарт-элемент не создан (${payload.domain}, activity ` +
                    `${payload.activityId}): ${(error as Error).message}`,
            );
        }
    }

    /** Постановка стадии анализа вслед за транскрибацией. */
    private async dispatchAnalyze(
        payload: CallReportJobPayload,
        transcriptionId: string,
    ): Promise<void> {
        const stagePayload: CallReportAnalyzeStagePayload = {
            ...payload,
            transcriptionId,
        };
        const jobId = `${buildDedupKey(payload.domain, payload.activityId)}:analyze`;
        const timeoutMs = Number.parseInt(
            process.env.CALL_REPORT_JOB_TIMEOUT_MS ?? '',
            10,
        );
        await this.queueDispatcher.dispatch(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_ANALYZE,
            stagePayload,
            jobId,
            {
                ...ANALYZE_JOB_OPTS,
                ...(Number.isFinite(timeoutMs) && timeoutMs > 0
                    ? { timeout: timeoutMs }
                    : {}),
            },
        );
        this.logger.log(
            `Стадия ANALYZE поставлена в очередь (${jobId}, transcription ${transcriptionId})`,
        );
    }

    /** Лог провала стадии; Telegram — только на последней попытке. */
    private reportFailure(
        stage: string,
        job: Job<CallReportJobPayload>,
        error: Error,
    ): void {
        const { domain, activityId } = job.data;
        const maxAttempts = job.opts.attempts ?? 1;
        const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;
        this.logger.error(
            `Ошибка стадии ${stage} ${domain}/${activityId}` +
                `${isLastAttempt ? ` (все ${maxAttempts} попытки исчерпаны)` : ''}: ${error.message}`,
            {
                ...(isLastAttempt ? { telegram: true } : {}),
                domain,
                activityId,
                stage,
            },
        );
    }
}
