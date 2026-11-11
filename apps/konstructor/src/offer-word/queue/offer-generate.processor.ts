import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { resolveQueueConcurrency } from '@lib/queue/concurrency/resolve-queue-concurrency';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordByTemplateGenerateUseCase } from '../use-cases/offer-word-by-template-generate.use-case';

export type OfferGenerateJobPayload = {
    dto: OfferWordByTemplateGenerateDto;
};

/**
 * Сколько КП генерировать одновременно. Пока очередь была общей с записью
 * сделки и КП v2, параллельность трёх именованных обработчиков у Bull
 * складывалась (3 задания любого типа); после разделения очередей у каждой
 * своя. Потолок конвертации всё равно держит пул LibreOffice (4 слота).
 */
const OFFER_GENERATE_CONCURRENCY = resolveQueueConcurrency(
    'KONSTRUCTOR_OFFER_GENERATE_CONCURRENCY',
    3,
);

@Processor(QueueNames.KONSTRUCTOR_OFFER_GENERATE)
export class OfferGenerateProcessor {
    private readonly logger = new Logger(OfferGenerateProcessor.name);
    constructor(
        private readonly offerWordByTemplateGenerateUseCase: OfferWordByTemplateGenerateUseCase,
    ) {}
    @Process({
        name: JobNames.OFFER_GENERATE,
        concurrency: OFFER_GENERATE_CONCURRENCY,
    })
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
