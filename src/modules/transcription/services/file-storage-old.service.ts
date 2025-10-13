// import { Injectable, Logger } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
// import { createWriteStream, existsSync } from 'fs';
// import { mkdir } from 'fs/promises';
// import { join } from 'path';
// import { AwsCredentialIdentity } from '@aws-sdk/types';

// @Injectable()
// export class FileStorageService {
//     private readonly logger = new Logger(FileStorageService.name);
//     private readonly s3Client: S3Client;
//     private readonly yaS3Bucket: string;
//     private readonly yaS3Endpoint: string;

//     constructor(
//         private readonly configService: ConfigService,
//     ) {
//         this.yaS3Bucket = this.configService.get<string>('YA_BUCKET_NAME', 'april-test');
//         this.yaS3Endpoint = 'https://storage.yandexcloud.net';
//         const accessKeyId = this.configService.get<string>('YA_ACCESS_KEY_KEY_ID');
//         const secretAccessKey = this.configService.get<string>('YA_ACCESS_KEY_SECRET');

//         if (!accessKeyId || !secretAccessKey) {
//             throw new Error('YA_ACCESS_KEY_KEY_ID or YA_ACCESS_KEY_SECRET is not set in environment variables');
//         }

//         this.s3Client = new S3Client({
//             region: 'ru-central1',
//             endpoint: this.yaS3Endpoint,
//             credentials: {
//                 accessKeyId,
//                 secretAccessKey,
//             } as AwsCredentialIdentity,
//         });
//     }

//     async getFileUrl(fileName: string, domain: string, userId: string): Promise<string | null> {
//         try {
//             const localFilePath = join(process.cwd(), 'storage', 'audio', domain, userId, fileName);
//             const s3Key = `audio/${domain}/${userId}/${fileName}`;
//             const s3Url = `${this.yaS3Endpoint}/${this.yaS3Bucket}/${s3Key}`;

//             // Проверяем S3
//             try {
//                 const s3Response = await this.s3Client.send(new HeadObjectCommand({
//                     Bucket: this.yaS3Bucket,
//                     Key: s3Key,
//                 }));
//                 this.logger.log('File exists in S3:', { key: s3Key, size: s3Response.ContentLength });
//                 return s3Url;
//             } catch (error) {
//                 this.logger.log('File not found in S3');
//             }

//             // Проверяем локальный файл
//             if (existsSync(localFilePath)) {
//                 this.logger.log('File exists locally:', { path: localFilePath });
//                 const uploadedUrl = await this.uploadToS3(localFilePath, fileName, domain, userId);
//                 if (!uploadedUrl) {
//                     throw new Error('Failed to upload file to S3');
//                 }
//                 return uploadedUrl;
//             }

//             return null;
//         } catch (error) {
//             this.logger.error('Error getting file URL:', error);
//             return null;
//         }
//     }

//     async downloadAndSaveFile(fileUrl: string, fileName: string, domain: string, userId: string): Promise<string | null> {
//         try {
//             // Download file
//             const fileContent = await this.downloadFile(fileUrl);
//             if (!fileContent) {
//                 return null;
//             }

//             // Save locally
//             const localFilePath = await this.saveLocalFile(fileContent, fileName, domain, userId);

//             // Upload to S3
//             const s3Url = await this.uploadToS3(localFilePath, fileName, domain, userId);
//             if (!s3Url) {
//                 throw new Error('Failed to upload file to S3');
//             }
//             return s3Url;
//         } catch (error) {
//             this.logger.error('Error downloading and saving file:', error);
//             return null;
//         }
//     }

//     private async downloadFile(url: string): Promise<Buffer | null> {
//         try {
//             const response = await fetch(url);
//             if (!response.ok) {
//                 throw new Error(`Failed to download file: ${response.statusText}`);
//             }
//             return Buffer.from(await response.arrayBuffer());
//         } catch (error) {
//             this.logger.error('Error downloading file:', error);
//             return null;
//         }
//     }

//     private async saveLocalFile(fileContent: Buffer, fileName: string, domain: string, userId: string): Promise<string> {
//         const dirPath = join(process.cwd(), 'storage', 'audio', domain, userId);
//         await mkdir(dirPath, { recursive: true });

//         const filePath = join(dirPath, fileName);

//         return new Promise((resolve, reject) => {
//             const writeStream = createWriteStream(filePath);
//             writeStream.on('error', (error) => {
//                 this.logger.error('Error writing file:', error);
//                 reject(error);
//             });
//             writeStream.on('finish', () => {
//                 this.logger.log('File saved successfully:', { path: filePath });
//                 resolve(filePath);
//             });
//             writeStream.write(fileContent);
//             writeStream.end();
//         });
//     }

//     private async uploadToS3(localFilePath: string, fileName: string, domain: string, userId: string): Promise<string | null> {
//         try {
//             if (!existsSync(localFilePath)) {
//                 throw new Error(`File not found: ${localFilePath}`);
//             }

//             // Проверяем размер файла
//             const stats = await require('fs').promises.stat(localFilePath);
//             this.logger.log('File stats:', {
//                 size: stats.size,
//                 isFile: stats.isFile(),
//                 path: localFilePath
//             });

//             if (stats.size === 0) {
//                 throw new Error('File is empty');
//             }

//             const key = `audio/${domain}/${userId}/${fileName}`;
//             this.logger.log('S3 key:', key);

//             const fileContent = await require('fs').promises.readFile(localFilePath);
//             this.logger.log('File content size:', fileContent.length);

//             this.logger.log('Sending file to S3...');
//             const s3FileResponse = await this.s3Client.send(new PutObjectCommand({
//                 Bucket: this.yaS3Bucket,
//                 Key: key,
//                 Body: fileContent,
//             }));

//             this.logger.log('File successfully uploaded to S3', { response: s3FileResponse });

//             const objectUrl = `${this.yaS3Endpoint}/${this.yaS3Bucket}/${key}`;
//             this.logger.log('Generated S3 URL', { url: objectUrl });

//             return objectUrl;
//         } catch (error) {
//             this.logger.error('Error uploading to S3:', error);
//             this.logger.error('Error details:', {
//                 message: error.message,
//                 code: error.code,
//                 stack: error.stack,
//                 name: error.name
//             });
//             return null;
//         }
//     }
// }
