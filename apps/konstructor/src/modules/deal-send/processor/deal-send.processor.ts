import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PBXService } from '@lib/pbx';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { DealSendJobDto } from '../dto/deal-send-job.dto';
import { DealSendWriterService } from '../services/deal-send-writer.service';

@Processor(QueueNames.KONSTRUCTOR)
export class DealSendProcessor {
    private readonly logger = new Logger(DealSendProcessor.name);

    constructor(private readonly pbx: PBXService) {}

    @Process(JobNames.KONSTRUCTOR_DEAL_SEND)
    async handle(job: Job<DealSendJobDto>): Promise<void> {
        this.logger.log(
            `${JobNames.KONSTRUCTOR_DEAL_SEND}: ${job.data.domain} сделка ${job.data.dealId}`,
        );
        try {
            const { bitrix } = await this.pbx.init(job.data.domain);
            await new DealSendWriterService(bitrix).write(job.data);
        } catch (error) {
            // Bull помечает задание failed молча: без этой строки упавшая
            // запись в Bitrix не видна нигде, а фронт уже показал «сохранено»
            this.logger.error(
                `${JobNames.KONSTRUCTOR_DEAL_SEND}: ${job.data.domain} сделка ${job.data.dealId} не записана — ${describeError(error)}`,
            );
            throw error;
        }
    }
}

/** Текст ошибки Bitrix (axios: response.data) или обычной ошибки. */
const describeError = (error: unknown): string => {
    const data = (error as { response?: { data?: unknown } })?.response?.data;
    if (data) return JSON.stringify(data);
    return error instanceof Error ? error.message : String(error);
};
