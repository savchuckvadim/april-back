import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { StorageService, StorageType } from 'src/core/storage/storage.service';
import { YandexStorageService } from 'src/clients/yandex/yandex-storage.service';

@Injectable()
export class FileStorageService {
    private readonly logger = new Logger(FileStorageService.name);
    private readonly maxRetries = 3;
    private readonly retryDelay = 1000; // 1 second

    constructor(
        private readonly configService: ConfigService,
        private readonly storageService: StorageService,
        private readonly yandexStorageService: YandexStorageService,
    ) {}

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getFileUrl(
        fileName: string,
        domain: string,
        userId: string,
    ): Promise<string | null> {
        try {
            const s3Key = `transcription/audio/${domain}/${userId}/${fileName}`;

            // Проверяем S3
            const existsInS3 =
                await this.yandexStorageService.fileExists(s3Key);
            if (existsInS3) {
                this.logger.log('File exists in S3:', { key: s3Key });
                return await this.yandexStorageService.getFileUrl(s3Key);
            }

            // Проверяем локальный файл
            const localFilePath = this.storageService.getFilePath(
                StorageType.PRIVATE,
                join('audio', domain, userId),
                fileName,
            );
            const existsLocally =
                await this.storageService.fileExists(localFilePath);

            if (existsLocally) {
                this.logger.log('File exists locally:', {
                    path: localFilePath,
                });
                const fileContent =
                    await this.storageService.readFile(localFilePath);

                // Загружаем в S3 с повторными попытками
                for (let i = 0; i < this.maxRetries; i++) {
                    try {
                        return await this.yandexStorageService.uploadFile(
                            fileContent,
                            s3Key,
                            'audio/mpeg',
                        );
                    } catch (error) {
                        if (i === this.maxRetries - 1) throw error;
                        this.logger.warn(
                            `Retry ${i + 1}/${this.maxRetries} uploading to S3`,
                        );
                        await this.sleep(this.retryDelay);
                    }
                }
            }

            return null;
        } catch (error) {
            this.logger.error('Error getting file URL:', error);
            return null;
        }
    }

    async downloadAndSaveFile(
        fileUrl: string,
        fileName: string,
        domain: string,
        userId: string,
    ): Promise<string | null> {
        try {
            // Download file
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(
                    `Failed to download file: ${response.statusText}`,
                );
            }

            // Получаем бинарные данные
            const arrayBuffer = await response.arrayBuffer();
            const fileContent = Buffer.from(arrayBuffer);

            this.logger.debug('File downloaded, size:', fileContent.length);

            // Save locally with retries
            const subPath = join('transcription/audio', domain, userId);
            let localFilePath: string | null = null;

            for (let i = 0; i < this.maxRetries; i++) {
                try {
                    localFilePath = await this.storageService.saveFile(
                        fileContent,
                        fileName,
                        StorageType.PRIVATE,
                        subPath,
                    );
                    break;
                } catch (error) {
                    if (error.code === 'EBUSY') {
                        if (i === this.maxRetries - 1) throw error;
                        this.logger.warn(
                            `Retry ${i + 1}/${this.maxRetries} saving file (EBUSY)`,
                        );
                        await this.sleep(this.retryDelay);
                    } else {
                        throw error;
                    }
                }
            }

            if (!localFilePath) {
                throw new Error('Failed to save file after retries');
            }

            // Upload to S3 with retries
            const s3Key = `transcription/audio/${domain}/${userId}/${fileName}`;
            for (let i = 0; i < this.maxRetries; i++) {
                try {
                    return await this.yandexStorageService.uploadFile(
                        fileContent,
                        s3Key,
                        'audio/mpeg',
                    );
                } catch (error) {
                    if (i === this.maxRetries - 1) throw error;
                    this.logger.warn(
                        `Retry ${i + 1}/${this.maxRetries} uploading to S3`,
                    );
                    await this.sleep(this.retryDelay);
                }
            }

            throw new Error('Failed to upload to S3 after retries');
        } catch (error) {
            this.logger.error('Error downloading and saving file:', error);
            return null;
        }
    }

    async getAudioFile(filePath: string): Promise<Buffer> {
        try {
            // Если это URL, скачиваем файл
            if (filePath.startsWith('http')) {
                const response = await fetch(filePath);
                if (!response.ok) {
                    throw new Error(
                        `Failed to download file: ${response.statusText}`,
                    );
                }
                const arrayBuffer = await response.arrayBuffer();
                return Buffer.from(arrayBuffer);
            }

            // Если это локальный путь, читаем файл
            return this.storageService.readFile(filePath);
        } catch (error) {
            this.logger.error('Error getting audio file:', error);
            throw error;
        }
    }

    // async deleteAudioFile(filePath: string): Promise<void> {
    //     // Удаляем только локальные файлы
    //     if (!filePath.startsWith('http')) {
    //         await this.storageService.deleteFile(filePath);
    //     }
    // }
}
