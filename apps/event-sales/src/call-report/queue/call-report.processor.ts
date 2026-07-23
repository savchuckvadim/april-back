import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import {
    CallReportJobPayload,
    CallReportPipelineUseCase,
} from '../use-cases/call-report-pipeline.use-case';

/**
 * Concurrency воркера читается на этапе декорации класса, поэтому только
 * из process.env (env CALL_REPORT_CONCURRENCY, по умолчанию 3).
 * Параллелить звонки безопасно: у каждого внешнего провайдера свой
 * пер-провайдерный лимитер (TranscriptionRouterService, GigaChatProvider).
 */
function resolveConcurrency(): number {
    const parsed = Number.parseInt(
        process.env.CALL_REPORT_CONCURRENCY ?? '',
        10,
    );
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 3;
}

/**
 * Воркер очереди CALL_REPORT: обрабатывает до CALL_REPORT_CONCURRENCY
 * звонков параллельно; лимиты на транскрибаторы и LLM держат
 * пер-провайдерные семафоры внутри сервисов.
 * Ошибка пробрасывается в Bull для ретрая (attempts задаёт сканер);
 * статус error в transcriptions ставит сам pipeline use-case.
 */
@Processor(QueueNames.CALL_REPORT)
export class CallReportProcessor {
    private readonly logger = new Logger(CallReportProcessor.name);

    constructor(private readonly pipeline: CallReportPipelineUseCase) {}

    @Process({
        name: JobNames.CALL_REPORT_ANALYZE,
        concurrency: resolveConcurrency(),
    })
    async handle(job: Job<CallReportJobPayload>): Promise<void> {
        const { domain, activityId } = job.data;
        this.logger.log(
            `Обработка звонка: ${domain}, activity ${activityId} (job ${job.id})`,
        );
        try {
            const result = await this.pipeline.execute(job.data);
            this.logger.log(
                `Звонок обработан: transcription ${result.transcriptionId}, ` +
                    `provider ${result.provider}, resume=${result.resumeSaved}, ` +
                    `recomendation=${result.recomendationSaved}`,
            );
        } catch (error) {
            // Telegram-алерт на последней попытке: ретраи Bull — штатный путь,
            // спамить не надо ({ telegram: true } — транспорт логгера).
            const maxAttempts = job.opts.attempts ?? 1;
            const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;
            this.logger.error(
                `Ошибка обработки звонка ${domain}/${activityId}` +
                    `${isLastAttempt ? ` (все ${maxAttempts} попытки исчерпаны)` : ''}: ${(error as Error).message}`,
                {
                    ...(isLastAttempt ? { telegram: true } : {}),
                    domain,
                    activityId,
                },
            );
            throw error;
        }
    }
}
