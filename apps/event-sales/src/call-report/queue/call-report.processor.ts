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
 * Воркер очереди CALL_REPORT: обрабатывает по одному звонку за раз
 * (concurrency 1 — не параллелим транскрибаторы и GigaChat).
 * Ошибка пробрасывается в Bull для ретрая (attempts задаёт сканер);
 * статус error в transcriptions ставит сам pipeline use-case.
 */
@Processor(QueueNames.CALL_REPORT)
export class CallReportProcessor {
    private readonly logger = new Logger(CallReportProcessor.name);

    constructor(private readonly pipeline: CallReportPipelineUseCase) {}

    @Process({ name: JobNames.CALL_REPORT_ANALYZE, concurrency: 1 })
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
            this.logger.error(
                `Ошибка обработки звонка ${domain}/${activityId}: ${(error as Error).message}`,
            );
            throw error;
        }
    }
}
