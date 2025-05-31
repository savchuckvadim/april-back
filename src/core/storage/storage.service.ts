import { Global, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream, createReadStream, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';
import * as fs from 'fs/promises';
import * as path from 'path';

const pipelineAsync = promisify(pipeline);

export enum StorageType {
    APP = 'app',
    PUBLIC = 'public',
    PRIVATE = 'private'
}

@Global()
@Injectable()
export class StorageService {
    private readonly logger = new Logger(StorageService.name);
    private readonly storagePath: string;

    constructor(private readonly configService: ConfigService) {
        this.storagePath = this.configService.get<string>('STORAGE_PATH') || 'storage';
    }

    private initializeStorage() {
        // Create base storage directories
        Object.values(StorageType).forEach(type => {
            const path = join(this.storagePath, type);
            if (!existsSync(path)) {
                mkdirSync(path, { recursive: true });
            }
        });
    }

    getFilePath(type: StorageType, subPath: string, fileName: string): string {
        return join(this.storagePath, type, subPath, fileName);
    }

    async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async saveFile(content: Buffer, fileName: string, type: StorageType, subPath: string): Promise<string> {
        try {
            const fullPath = this.getFilePath(type, subPath, fileName);
            const dirPath = path.dirname(fullPath);

            // Создаем директорию, если её нет
            await fs.mkdir(dirPath, { recursive: true });

            // Сохраняем файл
            await fs.writeFile(fullPath, content);

            return fullPath;
        } catch (error) {
            this.logger.error('Error saving file:', error);
            throw error;
        }
    }

    async readFile(filePath: string): Promise<Buffer> {
        try {
            return await fs.readFile(filePath);
        } catch (error) {
            this.logger.error('Error reading file:', error);
            throw error;
        }
    }

    async deleteFile(filePath: string): Promise<void> {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            this.logger.error('Error deleting file:', error);
            throw error;
        }
    }

    async fileExistsByType(type: StorageType, subPath: string, fileName: string): Promise<boolean> {
        const filePath = this.getFilePath(type, subPath, fileName);
        return this.fileExists(filePath);
    }
    async readFileByType(type: StorageType, filePath: string, fileName: string): Promise<Buffer> {
        try {
            const path = join(this.storagePath, type, filePath, fileName);
            return await fs.readFile(path);
        } catch (error) {
            this.logger.error('Error reading file:', error);
            throw error;
        }
    }

    async countFilesInDirectory(type: StorageType, subPath: string): Promise<number> {
        try {
          const dirPath = this.getFilePath(type, subPath, ''); // получаем путь к папке
          const files = await fs.readdir(dirPath);
          return files.length;
        } catch (err) {
          this.logger.error(`Ошибка при подсчёте файлов в папке ${type}/${subPath}:`, err);
          return 1;
        }
      }
} 