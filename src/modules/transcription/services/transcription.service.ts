import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from 'src/core/redis/redis.service';
import { FileStorageCopyService } from './file-storage-copy.service';
import { StreamingTranscriptionService } from './streaming-transcription.service';


@Injectable()
export class TranscriptionService {
    private readonly logger = new Logger(TranscriptionService.name);

    constructor(

        private readonly redisService: RedisService,
        private readonly fileStorageService: FileStorageCopyService,
        private readonly streamingTranscriptionService: StreamingTranscriptionService,
    ) { }

    async transcribe(fileUrl: string, fileName: string, taskId: string, domain: string, userId: string): Promise<string | null> {
        try {
            await this.updateStatus(taskId, 'processing');

            // Пытаемся получить URL файла из хранилища
            let fileUri = await this.fileStorageService.getFileUrl(fileName, domain, userId);

            // Если файла нет в хранилище, скачиваем и сохраняем
            if (!fileUri) {
                this.logger.log('File not found in storage, downloading from URL');
                fileUri = await this.fileStorageService.downloadAndSaveFile(fileUrl, fileName, domain, userId);
                if (!fileUri) {
                    await this.updateStatus(taskId, 'error', 'Failed to download or save file');
                    return null;
                }
            }

            // Start transcription using S3 URI
            const operationId = await this.streamingTranscriptionService.transcribeAudio(fileUri);
            const text = await this.streamingTranscriptionService.getTranscriptionResult(operationId);

            if (text) {
                await this.updateStatus(taskId, 'done', null, text);
                return text;
            }

            await this.updateStatus(taskId, 'error', 'Transcription failed');
            return null;
        } catch (error) {
            this.logger.error('Transcription error:', error);
            await this.updateStatus(taskId, 'error', error.message);
            return null;
        }
    }

    private async updateStatus(taskId: string, status: string, error?: string | null, text?: string): Promise<void> {
        const redis = this.redisService.getClient();
        const key = `transcription:${taskId}`;

        await redis.set(`${key}:status`, status, 'EX', 3600); // 1 hour TTL

        if (error) {
            await redis.set(`${key}:error`, error, 'EX', 3600);
        }

        if (text) {
            await redis.set(`${key}:text`, text, 'EX', 3600);
        }
    }
} 