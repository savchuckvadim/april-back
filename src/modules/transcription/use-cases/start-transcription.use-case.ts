import { Injectable } from '@nestjs/common';
import { QueueDispatcherService } from '../../queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '../../queue/constants/queue-names.enum';
import { TranscribeJobHandlerId } from '../../queue/constants/transcribe-job-handler-id.enum';
import {
    TranscriptionRequestDto,
    TranscriptionResponseDto,
} from '../dto/transcription.dto';
import { RedisService } from '../../../core/redis/redis.service';

@Injectable()
export class StartTranscriptionUseCase {
    constructor(
        private readonly queueDispatcher: QueueDispatcherService,
        private readonly redisService: RedisService,
    ) {}

    async execute(
        dto: TranscriptionRequestDto,
    ): Promise<TranscriptionResponseDto> {
        const taskId = `transcribe_${Date.now()}`;

        // Сохраняем начальный статус в Redis
        const redis = this.redisService.getClient();
        await redis.set(
            `transcription:${taskId}:status`,
            'started',
            'EX',
            3600,
        ); // TTL 1 час

        // Добавляем задачу в очередь
        await this.queueDispatcher.dispatch(
            QueueNames.TRANSCRIBE_AUDIO,
            TranscribeJobHandlerId.TRANSCRIBE,
            {
                fileUrl: dto.fileUrl,
                fileName: dto.fileName,
                taskId,
                domain: dto.domain,
                userId: dto.userId,
                userName: dto.userName,
                appName: dto.appName,
                activityId: dto.activityId,
                fileId: dto.fileId,
                duration: dto.duration,
                department: dto.department,
                entityType: dto.entityType,
                entityId: dto.entityId,
                entityName: dto.entityName,
            },
        );

        return { taskId, status: 'started' };
    }
}
