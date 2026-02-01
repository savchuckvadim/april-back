import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from 'src/core/redis/redis.service';
import { FileStorageService } from './file-storage.service';
import { StreamingTranscriptionService } from './streaming-transcription.service';
import { OnlineTranscriptionService } from 'src/clients/online';
import { TranscriptionStoreService } from './transcription.store.service';

@Injectable()
export class TranscriptionService {
    private readonly logger = new Logger(TranscriptionService.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly fileStorageService: FileStorageService,
        private readonly streamingTranscriptionService: StreamingTranscriptionService,
        private readonly onlineClient: OnlineTranscriptionService,
        private readonly transcriptionStoreService: TranscriptionStoreService,
    ) { }

    async transcribe(
        fileUrl: string,
        fileName: string,
        taskId: string,
        domain: string,
        userId: string,
        userName: string,
        appName: string,
        activityId: string,
        fileId: string,
        duration: string,
        department: string,
        entityType: string,
        entityId: string,
        entityName: string,
    ): Promise<string | null> {
        let transcriptionId: string | undefined;
        try {
            await this.updateStatus(taskId, 'processing');

            const transcriptionOnline = await this.transcriptionStoreService.create({
                userName: userName,
                app: appName,
                activityId: activityId,
                fileId: fileId,
                duration: duration,
                department: department,
                domain: domain,
                userId: userId,
                entityType: entityType,
                entityId: entityId,
                entityName: entityName,
                status: 'processing',
                symbolsCount: '0',
                price: '0',
                text: '',
                provider: 'yandex',
                inComment: false,
            });
            // await this.onlineClient.sendTranscription({
            //     user_name: userName,
            //     app: appName,
            //     activity_id: activityId,
            //     file_id: fileId,
            //     duration: duration,
            //     department: department,
            //     domain: domain,
            //     user_id: userId,
            //     entity_type: entityType,
            //     entity_id: entityId,
            //     entity_name: entityName,
            //     status: 'processing',
            //     symbols_count: 0,
            //     price: 0,
            //     text: '',
            //     provider: 'yandex',
            // });
            if (transcriptionOnline && transcriptionOnline.id) {
                transcriptionId = transcriptionOnline.id.toString();
            }
            this.logger.log(
                `Transcription online: ${JSON.stringify(transcriptionOnline)}`,
            );
            // Пытаемся получить URL файла из хранилища
            let fileUri = await this.fileStorageService.getFileUrl(
                fileName,
                domain,
                userId,
            );

            // Если файла нет в хранилище, скачиваем и сохраняем
            if (!fileUri) {
                this.logger.log(
                    'File not found in storage, downloading from URL',
                );
                fileUri = await this.fileStorageService.downloadAndSaveFile(
                    fileUrl,
                    fileName,
                    domain,
                    userId,
                );
                if (!fileUri) {
                    await this.updateStatus(
                        taskId,
                        'error',
                        'Failed to download or save file',
                    );
                    return null;
                }
            }

            // Start transcription using S3 URI
            const operationId =
                await this.streamingTranscriptionService.transcribeAudio(
                    fileUri,
                );
            const text =
                await this.streamingTranscriptionService.getTranscriptionResult(
                    operationId,
                );

            if (text) {
                await this.updateStatus(
                    taskId,
                    'done',
                    null,
                    text,
                    transcriptionId,
                );

                if (transcriptionId) {
                    // void (await this.onlineClient.updateTranscription(
                    //     {
                    //         status: 'done',
                    //         symbols_count: text.length,
                    //         price: 0,
                    //         text,
                    //         provider: 'yandex',
                    //     },
                    //     transcriptionId,
                    // ));
                    await this.transcriptionStoreService.updateTranscription(
                        transcriptionId,
                        {
                            status: 'done',
                            symbolsCount: text.length.toString(),
                            price: '0',
                            text: text,

                        }
                    )
                }
                return text;
            }

            await this.updateStatus(
                taskId,
                'error',
                'Transcription failed',
                transcriptionId,
            );

            if (transcriptionId) {
                // void (await this.onlineClient.updateTranscription(
                //     {
                //         status: 'error',
                //         symbols_count: text.length,
                //         price: 0,
                //         text,
                //         provider: 'yandex',
                //     },
                //     transcriptionId,
                // ));
                await this.transcriptionStoreService.updateTranscription(
                    transcriptionId,
                    {
                        status: 'error',
                        symbolsCount: text.length.toString(),
                        price: '0',
                        text: text,

                    }
                )
            }

            return null;
        } catch (error) {
            this.logger.error('Transcription error:', error);
            await this.updateStatus(
                taskId,
                'error',
                error.message,
                transcriptionId,
            );
            return null;
        }
    }

    private async updateStatus(
        taskId: string,
        status: string,
        error?: string | null,
        text?: string,
        transcriptionId?: string,
    ): Promise<void> {
        const redis = this.redisService.getClient();
        const key = `transcription:${taskId}`;

        await redis.set(`${key}:status`, status, 'EX', 3600); // 1 hour TTL
        if (transcriptionId) {
            await redis.set(
                `${key}:transcriptionId`,
                transcriptionId as string,
                'EX',
                3600,
            );
        }

        if (error) {
            await redis.set(`${key}:error`, error, 'EX', 3600);
        }

        if (text) {
            await redis.set(`${key}:text`, text, 'EX', 3600);
        }
    }
}
