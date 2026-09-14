import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { OfferWordMultiGenerateDto } from '../dto/offer-word-multi-generate.dto';
import { OfferWordMultiGenerateUseCase } from '../use-cases/offer-word-multi-generate.use-case';

export type OfferGenerateMultiJobPayload = {
    dto: OfferWordMultiGenerateDto;
    operationId: string;
};

@Processor(QueueNames.KONSTRUCTOR)
export class OfferGenerateMultiProcessor {
    private readonly logger = new Logger(OfferGenerateMultiProcessor.name);

    constructor(private readonly useCase: OfferWordMultiGenerateUseCase) {}

    @Process(JobNames.OFFER_GENERATE_MULTI)
    async handle(job: Job<OfferGenerateMultiJobPayload>): Promise<void> {
        const { dto } = job.data;
        const startedAt = Date.now();
        // operationId = job.id: по нему джоба ищется в очереди и в логах
        const context = `operationId=${String(job.id)} domain=${dto.domain} dealId=${dto.dealId} templateId=${dto.templateId} variants=${dto.variants?.length ?? 0}`;
        this.logger.log(`Генерация КП v2: старт ${context}`);

        try {
            await this.useCase.execute(dto);
            this.logger.log(
                `Генерация КП v2: успех ${context} durationMs=${Date.now() - startedAt}`,
            );
        } catch (error) {
            this.logger.error(
                `Генерация КП v2: провал ${context} durationMs=${Date.now() - startedAt} error=${(error as Error)?.message}`,
            );
            throw error;
        }
    }
}
