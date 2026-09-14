import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordByTemplateGenerateUseCase } from '../use-cases/offer-word-by-template-generate.use-case';

export type OfferGenerateJobPayload = {
    dto: OfferWordByTemplateGenerateDto;
};

@Processor(QueueNames.KONSTRUCTOR)
export class OfferGenerateProcessor {
    private readonly logger = new Logger(OfferGenerateProcessor.name);
    constructor(
        private readonly offerWordByTemplateGenerateUseCase: OfferWordByTemplateGenerateUseCase,
    ) {}
    @Process(JobNames.OFFER_GENERATE)
    async handle(job: Job<OfferGenerateJobPayload>): Promise<void> {
        const { dto } = job.data;
        const startedAt = Date.now();
        // только наблюдаемость: operationId = job.id, по нему джоба ищется в очереди и в логах
        const context = `operationId=${String(job.id)} domain=${dto.domain} dealId=${dto.dealId} templateId=${dto.templateId}`;
        this.logger.log(`Генерация КП: старт ${context}`);

        try {
            await this.offerWordByTemplateGenerateUseCase.execute(dto);
            this.logger.log(
                `Генерация КП: успех ${context} durationMs=${Date.now() - startedAt}`,
            );
        } catch (error) {
            this.logger.error(
                `Генерация КП: провал ${context} durationMs=${Date.now() - startedAt} error=${(error as Error)?.message}`,
            );
            throw error;
        }
    }
}
