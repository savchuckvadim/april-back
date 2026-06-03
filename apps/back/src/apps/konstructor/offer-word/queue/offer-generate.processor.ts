import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
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
        await this.offerWordByTemplateGenerateUseCase.execute(dto);
    }
}
