import { Injectable, Logger } from '@nestjs/common';
import { StorageService, StorageType } from 'src/core/storage';

@Injectable()
export class PriceExcelService {
    private readonly logger = new Logger(PriceExcelService.name);
    constructor(private readonly storage: StorageService) {}

    async getPath() {
        const path = this.storage.getFilePath(
            StorageType.APP,
            'garant',
            'prices.xlsx',
        );
        const fileExists = await this.storage.fileExists(path);
        if (!fileExists) {
            return null;
        }
        return path;
    }

    async saveUploadedFile(fileBuffer: Buffer): Promise<string> {
        const path = await this.storage.saveFile(
            fileBuffer,
            'prices.xlsx',
            StorageType.APP,
            'garant',
        );
        return path;
    }

    async getExampleFilePath(): Promise<string> {
        return this.storage.getFilePath(
            StorageType.APP,
            'garant',
            'prices.xlsx',
        );
    }
}
