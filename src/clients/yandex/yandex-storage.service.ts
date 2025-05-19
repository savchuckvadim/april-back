import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3 } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

interface S3Error extends Error {
    code?: string;
}

@Injectable()
export class YandexStorageService {
    private readonly logger = new Logger(YandexStorageService.name);
    private readonly s3Client: S3;
    private readonly bucket: string;

    constructor(
        private readonly configService: ConfigService,
    ) {
        this.bucket = this.configService.get<string>('YA_BUCKET_NAME') || 'april-test';
        const accessKeyId = this.configService.get<string>('YA_ACCESS_KEY_KEY_ID');
        const secretAccessKey = this.configService.get<string>('YA_ACCESS_KEY_SECRET');

        if (!accessKeyId || !secretAccessKey) {
            throw new Error('YA_ACCESS_KEY_KEY_ID or YA_ACCESS_KEY_SECRET is not set');
        }

        this.logger.debug('Initializing S3 client with config:', {
            bucket: this.bucket,
            endpoint: 'https://storage.yandexcloud.net',
            region: 'ru-central1',
            hasAccessKey: !!accessKeyId,
            hasSecretKey: !!secretAccessKey,
        });

        this.s3Client = new S3({
            endpoint: 'https://storage.yandexcloud.net',
            region: 'ru-central1',
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
            forcePathStyle: true,
        });
    }

    async fileExists(key: string): Promise<boolean> {
        try {
            this.logger.debug('Checking if file exists:', { bucket: this.bucket, key });

            await this.s3Client.headObject({
                Bucket: this.bucket,
                Key: key,
            });

            this.logger.debug('File exists:', { bucket: this.bucket, key });
            return true;
        } catch (error) {
            const s3Error = error as S3Error;
            if (s3Error.name === 'NotFound') {
                this.logger.debug('File not found:', { bucket: this.bucket, key });
                return false;
            }
            this.logger.error('Error checking file existence:', {
                error: s3Error.message,
                code: s3Error.code,
                name: s3Error.name,
                bucket: this.bucket,
                key,
            });
            throw error;
        }
    }

    async getFileUrl(key: string): Promise<string> {
        const url = `https://${this.bucket}.storage.yandexcloud.net/${key}`;
        this.logger.debug('Generated file URL:', { url });
        return url;
    }

    async uploadFile(fileContent: Buffer, key: string, contentType: string): Promise<string> {
        try {
            this.logger.debug('Uploading file to S3:', {
                bucket: this.bucket,
                key,
                contentType,
                contentLength: fileContent.length,
            });

            const result = await this.s3Client.putObject({
                Bucket: this.bucket,
                Key: key,
                Body: fileContent,
                ContentType: contentType,
            });

            this.logger.log('File uploaded successfully:', {
                bucket: this.bucket,
                key,
                result,
            });

            const url = `https://${this.bucket}.storage.yandexcloud.net/${key}`;
            this.logger.debug('Generated file URL:', { url });
            return url;
        } catch (error) {
            const s3Error = error as S3Error;
            this.logger.error('Error uploading file to S3:', {
                error: s3Error.message,
                code: s3Error.code,
                name: s3Error.name,
                bucket: this.bucket,
                key,
                contentType,
                contentLength: fileContent.length,
            });
            throw error;
        }
    }

    async downloadFile(key: string): Promise<Buffer> {
        try {
            this.logger.debug('Downloading file from S3:', { bucket: this.bucket, key });

            const response = await this.s3Client.getObject({
                Bucket: this.bucket,
                Key: key,
            });

            const stream = response.Body as Readable;
            const chunks: Buffer[] = [];

            return new Promise((resolve, reject) => {
                stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                stream.on('error', (err) => {
                    const s3Error = err as S3Error;
                    this.logger.error('Error downloading file stream:', {
                        error: s3Error.message,
                        code: s3Error.code,
                        name: s3Error.name,
                        bucket: this.bucket,
                        key,
                    });
                    reject(err);
                });
                stream.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    this.logger.debug('File downloaded successfully:', {
                        bucket: this.bucket,
                        key,
                        size: buffer.length,
                    });
                    resolve(buffer);
                });
            });
        } catch (error) {
            const s3Error = error as S3Error;
            this.logger.error('Error downloading file from Yandex Storage:', {
                error: s3Error.message,
                code: s3Error.code,
                name: s3Error.name,
                bucket: this.bucket,
                key,
            });
            throw error;
        }
    }
} 
