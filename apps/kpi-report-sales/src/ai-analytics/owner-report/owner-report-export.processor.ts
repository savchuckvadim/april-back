import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import type {
    OwnerReportExportJobData,
    OwnerReportExportState,
} from '@lib/sales-ai-analytics';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { OwnerReportExportUseCase } from '../domain/use-cases/owner-report-export.use-case';

/**
 * Воркер выгрузки PDF отчёта собственнику для админки на общей очереди
 * SALES_KPI_REPORT. Отдельный класс, а не метод AiAnalyticsProcessor: тот
 * упёрся в лимит файла; Bull разводит обработчики по имени джобы.
 */
@Processor(QueueNames.SALES_KPI_REPORT)
export class OwnerReportExportProcessor {
    private readonly logger = new Logger(OwnerReportExportProcessor.name);

    constructor(private readonly exportUseCase: OwnerReportExportUseCase) {}

    @Process(JobNames.SALES_AI_ANALYTICS_OWNER_REPORT_EXPORT)
    async handle(
        job: Job<OwnerReportExportJobData>,
    ): Promise<OwnerReportExportState> {
        const { domain, kind, periodKey } = job.data;
        this.logger.log(
            `SALES_AI_ANALYTICS_OWNER_REPORT_EXPORT: ${domain} ${kind} ${periodKey}`,
        );
        return this.exportUseCase.execute(job.data);
    }
}
