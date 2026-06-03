import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/core/redis/redis.service';
import {
    BitrixTranscriptionResponseDto,
    BitrixTranscriptionStatus,
} from '../dto/bitrix-transcription.dto';

@Injectable()
export class GetBitrixTranscriptionResultUseCase {
    private readonly logger = new Logger(
        GetBitrixTranscriptionResultUseCase.name,
    );

    constructor(private readonly redisService: RedisService) {}

    async execute(taskId: string): Promise<BitrixTranscriptionResponseDto> {
        const redis = this.redisService.getClient();
        const status = await redis.get(`bitrix-transcription:${taskId}:status`);
        const error = await redis.get(`bitrix-transcription:${taskId}:error`);
        const text = await redis.get(`bitrix-transcription:${taskId}:text`);
        const transcriptionId = await redis.get(
            `bitrix-transcription:${taskId}:transcriptionId`,
        );

        const response: BitrixTranscriptionResponseDto = {
            taskId,
            status: (status as BitrixTranscriptionStatus) ?? 'not_found',
            transcriptionId: transcriptionId
                ? parseInt(transcriptionId, 10)
                : undefined,
        };

        if (text) response.text = text;
        if (error) response.error = error;

        if (!status) return response;

        if (status === 'done' || status === 'error') {
            await redis.del([
                `bitrix-transcription:${taskId}:status`,
                `bitrix-transcription:${taskId}:error`,
                `bitrix-transcription:${taskId}:text`,
                `bitrix-transcription:${taskId}:transcriptionId`,
            ]);
        }

        return response;
    }
}
