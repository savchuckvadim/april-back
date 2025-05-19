import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from 'src/core/redis/redis.service';
import { TranscriptionResponseDto } from '../dto/transcription.dto';

@Injectable()
export class GetTranscriptionResultUseCase {
    private readonly logger = new Logger(GetTranscriptionResultUseCase.name);

    constructor(
        private readonly redisService: RedisService,
    ) { }

    async execute(taskId: string): Promise<TranscriptionResponseDto> {
        const redis = this.redisService.getClient();
        const status = await redis.get(`transcription:${taskId}:status`);
        const error = await redis.get(`transcription:${taskId}:error`);
        const text = await redis.get(`transcription:${taskId}:text`);
        const transcriptionId = await redis.get(`transcription:${taskId}:transcriptionId`) as string | undefined;
       
        const response: TranscriptionResponseDto = {
            taskId,
            transcriptionId: transcriptionId ? parseInt(transcriptionId) : undefined,
            status: status || 'not_found',
        };

        if (text) {
            response.text = text;
        }

        if (error) {
            response.error = error;
        }

        if (!status) {
            return response;
        }

        // If processing is complete, clean up cache
        if (status === 'done' || status === 'error') {
            await redis.del([
                `transcription:${taskId}:status`,
                `transcription:${taskId}:error`,
                `transcription:${taskId}:text`,
            ]);
        }

        return response;
    }
} 