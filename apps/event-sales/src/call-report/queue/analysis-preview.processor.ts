import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import type {
    AnalysisPreviewJobData,
    AnalysisPreviewState,
} from '@lib/call-lib/call-report/analysis-preview';
import { AnalysisPreviewUseCase } from '../use-cases/analysis-preview.use-case';

/**
 * Проверка разбора на одном звонке: задание ставит админка
 * (`POST admin/call-analysis-preview`), здесь — фокус-разбор с цитатами без
 * записи и итог в Redis. Отдельный процессор той же очереди, чтобы не
 * раздувать процессор конвейера.
 */
@Processor(QueueNames.CALL_REPORT)
export class AnalysisPreviewProcessor {
    private readonly logger = new Logger(AnalysisPreviewProcessor.name);

    constructor(private readonly preview: AnalysisPreviewUseCase) {}

    @Process(JobNames.CALL_REPORT_ANALYSIS_PREVIEW)
    async handle(
        job: Job<AnalysisPreviewJobData>,
    ): Promise<AnalysisPreviewState> {
        this.logger.log(
            `CALL_REPORT_ANALYSIS_PREVIEW: ${job.data.domain}, расшифровка ${job.data.transcriptionId}`,
        );

        return this.preview.execute(job.data);
    }
}
