import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import type { Redis } from 'ioredis';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { RedisService } from '@/core/redis/redis.service';
import { OfferWordEphemeralPdfDocumentService } from '../services/preview-generate/offer-word-ephemeral-pdf-document.service';
import {
    OFFER_WORD_EPHEMERAL_PDF_REDIS_TTL_SEC,
    offerWordEphemeralPdfCancelRedisKey,
    offerWordEphemeralPdfResultRedisKey,
} from '../constants/offer-word-ephemeral-pdf.constants';

import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';

export type OfferWordEphemeralPdfJobPayload = {
    dto: OfferWordByTemplateGenerateDto;
    operationId: string;
};

@Processor(QueueNames.OFFER_WORD_EPHEMERAL_PDF)
export class OfferWordEphemeralPdfProcessor {
    private readonly logger = new Logger(OfferWordEphemeralPdfProcessor.name);

    constructor(
        private readonly offerWordEphemeralPdfDocumentService: OfferWordEphemeralPdfDocumentService,
        private readonly redisService: RedisService,
    ) {}

    private async throwIfCancelled(
        redis: Redis,
        operationId: string,
    ): Promise<void> {
        const cancelKey = offerWordEphemeralPdfCancelRedisKey(operationId);
        if (await redis.get(cancelKey)) {
            await redis.del(cancelKey);
            throw new Error('Операция отменена клиентом');
        }
    }

    @Process(JobNames.OFFER_WORD_EPHEMERAL_PDF_GENERATE)
    async handle(job: Job<OfferWordEphemeralPdfJobPayload>): Promise<void> {
        const { dto, operationId } = job.data;
        const redis = this.redisService.getClient();
        const key = offerWordEphemeralPdfResultRedisKey(operationId);

        try {
            await this.throwIfCancelled(redis, operationId);
            // 1. В воркере выполняется тяжёлая генерация: шаблон → DOCX → PDF в память, файлы на диске счищены.
            const { pdfBuffer, pdfFileName } =
                await this.offerWordEphemeralPdfDocumentService.buildPdfBufferRemovingFiles(
                    dto,
                );
            await this.throwIfCancelled(redis, operationId);
            // 2. Упаковываем PDF в JSON для Redis; polling может вызываться несколько раз до истечения TTL.
            const payload = JSON.stringify({
                pdfBase64: pdfBuffer.toString('base64'),
                fileName: pdfFileName,
                mimeType: 'application/pdf',
            });
            // 3. Кладём результат с TTL: если клиент не опросит — ключ сам исчезнет.
            await redis.set(
                key,
                payload,
                'EX',
                OFFER_WORD_EPHEMERAL_PDF_REDIS_TTL_SEC,
            );
        } catch (err) {
            // 4. Пробрасываем ошибку в Bull: job перейдёт в failed, polling вернёт status failed + причина.
            this.logger.error(
                `OfferWord ephemeral PDF job ${operationId} failed`,
                err,
            );
            throw err;
        }
    }
}
