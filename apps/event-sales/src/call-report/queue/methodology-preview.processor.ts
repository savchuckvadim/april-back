import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import type {
    MethodologyPreviewJobData,
    MethodologyPreviewState,
} from '@lib/call-lib/call-report/methodology';
import { MethodologyPreviewUseCase } from '../use-cases/methodology-preview.use-case';

/**
 * Проверка черновика методики на одном звонке: задание ставит админка
 * (`POST admin/methodologies/preview`), здесь — один проход методики и
 * запись итога в Redis. Отдельный процессор той же очереди, чтобы не
 * раздувать процессор конвейера.
 */
@Processor(QueueNames.CALL_REPORT)
export class MethodologyPreviewProcessor {
    private readonly logger = new Logger(MethodologyPreviewProcessor.name);

    constructor(private readonly preview: MethodologyPreviewUseCase) {}

    @Process(JobNames.CALL_REPORT_METHODOLOGY_PREVIEW)
    async handle(
        job: Job<MethodologyPreviewJobData>,
    ): Promise<MethodologyPreviewState> {
        this.logger.log(
            `CALL_REPORT_METHODOLOGY_PREVIEW: ${job.data.domain}, расшифровка ${job.data.transcriptionId}`,
        );

        return this.preview.execute(job.data);
    }
}
