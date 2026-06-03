import { Injectable, Logger } from '@nestjs/common';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { RedisService } from '@/core/redis/redis.service';
import {
    BitrixTranscriptionRequestDto,
    BitrixTranscriptionResponseDto,
} from '../dto/bitrix-transcription.dto';
import { TranscribeJobHandlerId } from '@/modules/queue/constants/transcribe-job-handler-id.enum';

const STATUS_TTL_SECONDS = 60 * 60;

@Injectable()
export class StartBitrixTranscriptionUseCase {
    private readonly logger = new Logger(StartBitrixTranscriptionUseCase.name);

    constructor(
        private readonly queueDispatcher: QueueDispatcherService,
        private readonly redisService: RedisService,
    ) {}

    async execute(
        dto: BitrixTranscriptionRequestDto,
    ): Promise<BitrixTranscriptionResponseDto> {
        const taskId = `${dto.domain}_bitrix_transcribe_${Date.now()}`;

        const redis = this.redisService.getClient();
        await redis.set(
            `bitrix-transcription:${taskId}:status`,
            'started',
            'EX',
            STATUS_TTL_SECONDS,
        );

        await this.queueDispatcher.dispatch(
            QueueNames.CALL_ANALYSIS,
            TranscribeJobHandlerId.TRANSCRIBE,
            { ...dto, taskId },
        );

        this.logger.log(
            `Queued bitrix transcription ${taskId} for ${dto.fileName}`,
        );
        return { taskId, status: 'started' };
    }
}
