import { Injectable, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { buildContentDispositionAttachment } from '@/core/http/content-disposition.util';
import { StorageService } from '../../../../core/storage/storage.service';
import { WordTemplateService } from './word-template.service';

@Injectable()
export class DownloadTemplateService {
    constructor(
        private readonly wordTemplateService: WordTemplateService,
        private readonly storageService: StorageService,
    ) {}

    async downloadById(id: string, res: Response): Promise<void> {
        const template = await this.wordTemplateService.findById(BigInt(id));

        if (!template.file_path) {
            throw new NotFoundException('Template file not found');
        }

        const fileExists = await this.storageService.fileExists(
            template.file_path,
        );
        if (!fileExists) {
            throw new NotFoundException('Template file not found in storage');
        }

        const fileBuffer = await this.storageService.readFile(
            template.file_path,
        );
        const safeFileName = this.sanitizeFileName(template.name || 'template');
        const fileName = `${safeFileName}.docx`;

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
        res.setHeader(
            'Content-Disposition',
            buildContentDispositionAttachment(fileName),
        );
        res.setHeader('Content-Length', fileBuffer.length.toString());
        res.end(fileBuffer);
    }

    private sanitizeFileName(name: string): string {
        if (!name) return 'template';

        const sanitized = name
            .replace(/[^a-zA-Z0-9\-_.]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .substring(0, 100)
            .trim();

        return sanitized || 'template';
    }
}
