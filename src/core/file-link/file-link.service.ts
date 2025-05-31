import { Injectable } from '@nestjs/common';
import { StorageService, StorageType } from 'src/core/storage';
import { EncryptService } from './encrypt.service';

@Injectable()
export class FileLinkService {


    constructor(
        private readonly storage: StorageService,
        private readonly encryptService: EncryptService
    ) { }

    /**
     * Сохраняет файл с псевдоименем и возвращает публичную ссылку
     */
    async createPublicLink(
        // buffer: Buffer,
        domain: string,
        userId: number,
        app: 'konstructor' | 'transcription',
        subDir: 'zoffer' | 'audio' | 'offer' | 'provider/stamp' | 'provider/logo' | 'offer' | 'contract' |'supply',
        year: string,
        fileName: string,

    ): Promise<string> {
        const payload = { domain, userId, app, subDir, year,  fileName };
       
        const token = this.encryptService.encryptData(payload);
        return `/api/files/${token}`;
    }

    /**
     * Восстанавливает путь к файлу по ссылке
     */
    async getFilePath(
        domain: string,
        userId: number,
        app: 'konstructor' | 'transcription',
        subDir: 'zoffer' | 'audio' | 'offer' | 'provider/stamp' | 'provider/logo' | 'offer' | 'contract' | 'supply',
        year: string,
        fileName: string
    ): Promise<string | null> {
        const filesPath = `${app}/${subDir}/${year}/${domain}/${userId}`;

        const exists = await this.storage.fileExistsByType(StorageType.PUBLIC, filesPath, fileName);
        if (!exists) return null;

        return this.storage.getFilePath(StorageType.PUBLIC, filesPath, fileName);
    }
}
