import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { TranscribeJobHandlerId } from '@/modules/queue/constants/transcribe-job-handler-id.enum';
import { RedisService } from '@/core/redis/redis.service';
import { TranscriptionStoreService } from '@/modules/transcription/services/transcription.store.service';
import { VibeCodeClient } from '../clients/vibecode.client';
import { BitrixTranscriptionRequestDto } from '../dto/bitrix-transcription.dto';

interface BitrixTranscribeJobData extends BitrixTranscriptionRequestDto {
    taskId: string;
}

const STATUS_TTL_SECONDS = 60 * 60;
const PROVIDER = 'bitrix-vibecode';

@Processor(QueueNames.CALL_ANALYSIS)
export class BitrixTranscribeProcessor {
    private readonly logger = new Logger(BitrixTranscribeProcessor.name);

    constructor(
        private readonly vibecode: VibeCodeClient,
        private readonly redisService: RedisService,
        private readonly transcriptionStore: TranscriptionStoreService,
    ) {}

    @Process(TranscribeJobHandlerId.TRANSCRIBE)
    async handle(job: Job<BitrixTranscribeJobData>): Promise<void> {
        const { taskId, fileUrl, fileName } = job.data;
        const redis = this.redisService.getClient();
        const statusKey = `bitrix-transcription:${taskId}:status`;
        const textKey = `bitrix-transcription:${taskId}:text`;
        const errorKey = `bitrix-transcription:${taskId}:error`;
        const transcriptionIdKey = `bitrix-transcription:${taskId}:transcriptionId`;

        this.logger.log(
            `Starting bitrix transcription ${taskId} (${fileName})`,
        );
        await redis.set(statusKey, 'processing', 'EX', STATUS_TTL_SECONDS);

        let transcriptionId: string | undefined;
        try {
            const stored = await this.transcriptionStore.create({
                userName: job.data.userName,
                app: job.data.appName,
                activityId: job.data.activityId,
                fileId: job.data.fileId,
                duration: job.data.duration,
                department: job.data.department,
                domain: job.data.domain,
                userId: job.data.userId,
                entityType: job.data.entityType,
                entityId: job.data.entityId,
                entityName: job.data.entityName,
                status: 'processing',
                symbolsCount: '0',
                price: '0',
                text: '',
                provider: PROVIDER,
                inComment: false,
            });
            transcriptionId = stored.id;
            await redis.set(
                transcriptionIdKey,
                transcriptionId,
                'EX',
                STATUS_TTL_SECONDS,
            );

            const buffer = await this.downloadBuffer(fileUrl);
            const text = await this.vibecode.transcribeAudio(buffer, fileName);

            await redis.set(textKey, text, 'EX', STATUS_TTL_SECONDS);
            await redis.set(statusKey, 'done', 'EX', STATUS_TTL_SECONDS);
            await this.transcriptionStore.updateTranscription(transcriptionId, {
                status: 'done',
                text,
                symbolsCount: text.length.toString(),
                price: '0',
            });

            this.logger.log(
                `Bitrix transcription ${taskId} done (${text.length} chars, dbId=${transcriptionId})`,
            );
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            await redis.set(errorKey, message, 'EX', STATUS_TTL_SECONDS);
            await redis.set(statusKey, 'error', 'EX', STATUS_TTL_SECONDS);
            if (transcriptionId) {
                try {
                    await this.transcriptionStore.updateTranscription(
                        transcriptionId,
                        { status: 'error', text: '' },
                    );
                } catch (updateErr) {
                    this.logger.error(
                        `Failed to mark transcription ${transcriptionId} as error: ${(updateErr as Error).message}`,
                    );
                }
            }
            this.logger.error(
                `Bitrix transcription ${taskId} failed: ${message}`,
            );
            throw e;
        }
    }

    private async downloadBuffer(url: string): Promise<Buffer> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(
                `Failed to download audio [${response.status}]: ${url}`,
            );
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
}
