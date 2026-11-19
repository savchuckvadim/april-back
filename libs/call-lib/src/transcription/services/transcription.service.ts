import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from '@lib/core/redis/redis.service';
import { YandexStorageService } from '@lib/call-lib/yandex/yandex-storage.service';
import { FileStorageService } from './file-storage.service';
import { StreamingTranscriptionService } from './streaming-transcription.service';
import { OnlineTranscriptionService } from '@lib/online';
import { TranscriptionStoreService } from './transcription.store.service';
import {
    YandexCallRecognizer,
    type YandexCallInput,
} from '../provider/yandex-call-recognizer';
import { YandexSubmissionGuard } from '../provider/yandex-submission-guard.service';

/** Файл старого пути POST /transcription: откуда скачать и чей он. */
interface LegacyAudioFile {
    fileUrl: string;
    fileName: string;
    domain: string;
    userId: string;
    duration: string;
}

@Injectable()
export class TranscriptionService {
    private readonly logger = new Logger(TranscriptionService.name);
    /**
     * Отправка в Яндекс — через стража, как у конвейера call-report
     * (19.11.2026): замок файла, лимит отправок, продолжение сохранённой
     * операции вместо повторной оплаты, удаление записи после ответа.
     */
    private readonly yandexRecognizer: YandexCallRecognizer;

    constructor(
        private readonly redisService: RedisService,
        private readonly fileStorageService: FileStorageService,
        streamingTranscriptionService: StreamingTranscriptionService,
        private readonly onlineClient: OnlineTranscriptionService,
        private readonly transcriptionStoreService: TranscriptionStoreService,
        yandexStorage: YandexStorageService,
        yandexGuard: YandexSubmissionGuard,
    ) {
        this.yandexRecognizer = new YandexCallRecognizer({
            storage: yandexStorage,
            yandex: streamingTranscriptionService,
            guard: yandexGuard,
            logger: this.logger,
        });
    }

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

            const transcriptionOnline =
                await this.transcriptionStoreService.create({
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
            const { text } = await this.yandexRecognizer.recognize(
                this.yandexInput({
                    fileUrl,
                    fileName,
                    domain,
                    userId,
                    duration,
                }),
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
                        },
                    );
                }
                return text;
            }

            await this.updateStatus(
                taskId,
                'error',
                'Transcription failed',
                undefined,
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
                    },
                );
            }

            return null;
        } catch (error) {
            this.logger.error('Transcription error:', error);
            await this.updateStatus(
                taskId,
                'error',
                (error as Error)?.message || 'Transcription error',
                undefined,
                transcriptionId,
            );
            return null;
        }
    }

    /**
     * Вход Яндекс-пути для файла по ссылке: ключ звонка для стража — ключ
     * записи в Object Storage; запись берётся из хранилища или скачивается
     * только когда отправка действительно нужна.
     */
    private yandexInput(file: LegacyAudioFile): YandexCallInput {
        const objectKey = this.fileStorageService.objectKeyOf(
            file.fileName,
            file.domain,
            file.userId,
        );
        const durationSec = Number(file.duration);
        return {
            call: {
                key: `legacy:${objectKey}`,
                domain: file.domain,
                label: `${file.fileName} (POST /transcription)`,
                durationSec:
                    Number.isFinite(durationSec) && durationSec > 0
                        ? durationSec
                        : undefined,
            },
            channels: null,
            upload: async () => {
                let uri = await this.fileStorageService.getFileUrl(
                    file.fileName,
                    file.domain,
                    file.userId,
                );
                if (!uri) {
                    this.logger.log(
                        'File not found in storage, downloading from URL',
                    );
                    uri = await this.fileStorageService.downloadAndSaveFile(
                        file.fileUrl,
                        file.fileName,
                        file.domain,
                        file.userId,
                    );
                }
                if (!uri) throw new Error('Failed to download or save file');
                return { objectKey, uri };
            },
        };
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
                transcriptionId,
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
