import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { RedisService } from '@/core/redis/redis.service';
import { OfferWordByTemplateGenerateDto } from '../../dto/offer-word-generate-request.dto';
import {
    OfferWordEphemeralPdfPollResponseDto,
    OfferWordEphemeralPdfStatusEnum,
    OfferWordEphemeralPdfStopResponseDto,
} from '../../dto/offer-word-ephemeral-pdf.dto';
import {
    OFFER_WORD_EPHEMERAL_PDF_CANCEL_TTL_SEC,
    offerWordEphemeralPdfCancelRedisKey,
    offerWordEphemeralPdfResultRedisKey,
} from '../../constants/offer-word-ephemeral-pdf.constants';

@Injectable()
export class OfferWordEphemeralPdfQueueService {
    constructor(
        private readonly queueDispatcher: QueueDispatcherService,
        private readonly redisService: RedisService,
    ) {}

    async start(dto: OfferWordByTemplateGenerateDto): Promise<string> {
        const operationId = randomUUID();
        const redis = this.redisService.getClient();
        if (!redis) {
            throw new Error('Redis client not found');
        }
        await this.queueDispatcher.dispatch(
            QueueNames.OFFER_WORD_EPHEMERAL_PDF,
            JobNames.OFFER_WORD_EPHEMERAL_PDF_GENERATE,
            { dto, operationId },
            operationId,
        );
        return operationId;
    }

    /**
     * Отмена: флаг в Redis (воркер не положит результат), удаление готового PDF из Redis,
     * снятие ожидающей задачи или попытка прервать активную.
     */
    async stop(
        operationId: string,
    ): Promise<OfferWordEphemeralPdfStopResponseDto> {
        const redis = this.redisService.getClient();
        const resultKey = offerWordEphemeralPdfResultRedisKey(operationId);
        const cancelKey = offerWordEphemeralPdfCancelRedisKey(operationId);

        await redis.set(
            cancelKey,
            '1',
            'EX',
            OFFER_WORD_EPHEMERAL_PDF_CANCEL_TTL_SEC,
        );
        await redis.del(resultKey);

        const job = await this.queueDispatcher.getJob(
            QueueNames.OFFER_WORD_EPHEMERAL_PDF,
            operationId,
        );

        if (!job) {
            return new OfferWordEphemeralPdfStopResponseDto(
                operationId,
                true,
                'Задача в очереди не найдена; ключ результата сброшен, отмена учтена',
            );
        }

        const state = await job.getState();

        if (state === 'waiting' || state === 'delayed' || state === 'paused') {
            await job.remove();
            return new OfferWordEphemeralPdfStopResponseDto(
                operationId,
                true,
                'Задача снята с очереди',
            );
        }

        if (state === 'active') {
            try {
                await job.moveToFailed({ message: 'Отменено клиентом' }, true);
            } catch {
                /* ignore */
            }
            return new OfferWordEphemeralPdfStopResponseDto(
                operationId,
                true,
                'Активная задача: установлен флаг отмены и запрошен сбой job в Bull',
            );
        }

        if (state === 'completed' || state === 'failed') {
            try {
                await job.remove();
            } catch {
                /* ignore */
            }
            return new OfferWordEphemeralPdfStopResponseDto(
                operationId,
                true,
                'Результат в Redis сброшен, запись о задаче в Bull удалена',
            );
        }

        return new OfferWordEphemeralPdfStopResponseDto(
            operationId,
            true,
            'Отмена применена',
        );
    }

    async poll(
        operationId: string,
    ): Promise<OfferWordEphemeralPdfPollResponseDto> {
        const job = await this.queueDispatcher.getJob(
            QueueNames.OFFER_WORD_EPHEMERAL_PDF,
            operationId,
        );
        if (!job) {
            throw new NotFoundException(
                `Operation ${operationId} not found or expired`,
            );
        }

        const state = await job.getState();
        const waitingLike =
            state === 'waiting' ||
            state === 'active' ||
            state === 'delayed' ||
            state === 'paused';

        if (waitingLike) {
            const out = new OfferWordEphemeralPdfPollResponseDto();
            out.status = OfferWordEphemeralPdfStatusEnum.PENDING;
            return out;
        }

        if (state === 'failed') {
            const out = new OfferWordEphemeralPdfPollResponseDto();
            out.status = OfferWordEphemeralPdfStatusEnum.FAILED;
            out.error = job.failedReason || 'PDF generation failed';
            return out;
        }

        if (state === 'completed') {
            const redis = this.redisService.getClient();
            const key = offerWordEphemeralPdfResultRedisKey(operationId);
            const raw = await redis.get(key);
            if (!raw) {
                const out = new OfferWordEphemeralPdfPollResponseDto();
                out.status = OfferWordEphemeralPdfStatusEnum.FAILED;
                out.error =
                    'Результат в Redis отсутствует: истёк TTL (подождали слишком долго) или запись не успела сохраниться.';
                return out;
            }
            // Не делаем DEL: повторные GET (Strict Mode, двойной poll) иначе получали бы «пусто при completed».
            // Срок жизни ключа задаётся при SET в процессоре (TTL).
            const parsed = JSON.parse(raw) as {
                pdfBase64: string;
                fileName: string;
                mimeType: string;
            };
            const out = new OfferWordEphemeralPdfPollResponseDto();
            out.status = OfferWordEphemeralPdfStatusEnum.READY;
            out.pdfBase64 = parsed.pdfBase64;
            out.fileName = parsed.fileName;
            out.mimeType = parsed.mimeType;
            return out;
        }

        const out = new OfferWordEphemeralPdfPollResponseDto();
        out.status = OfferWordEphemeralPdfStatusEnum.PENDING;
        return out;
    }
}
