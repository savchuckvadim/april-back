import { Injectable, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { buildContentDispositionAttachment } from '@/core/http/content-disposition.util';
import { StorageService } from '@/core/storage/storage.service';
import {
    InvoiceTemplateType,
    InvoiceTemplateTypeValue,
} from '../dto/invoice-template.enums';
import { InvoiceTemplateService } from './invoice-template.service';

const DOCX =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF = 'application/pdf';

@Injectable()
export class InvoiceTemplateDownloadService {
    constructor(
        private readonly invoiceTemplateService: InvoiceTemplateService,
        private readonly storageService: StorageService,
    ) {}

    async downloadById(id: string, res: Response): Promise<void> {
        const meta =
            await this.invoiceTemplateService.getFilePathForDownload(id);

        const exists = await this.storageService.fileExists(meta.file_path);
        if (!exists) {
            throw new NotFoundException('Файл шаблона не найден в хранилище');
        }

        const buffer = await this.storageService.readFile(meta.file_path);
        const safeName = this.sanitizeFileName(meta.name || 'invoice-template');
        const { mime, ext } = this.mimeForType(meta.type);
        const fileName = `${safeName}.${ext}`;

        res.setHeader('Content-Type', mime);
        res.setHeader(
            'Content-Disposition',
            buildContentDispositionAttachment(fileName),
        );
        res.setHeader('Content-Length', String(buffer.length));
        res.end(buffer);
    }

    private mimeForType(type: InvoiceTemplateTypeValue): {
        mime: string;
        ext: string;
    } {
        switch (type) {
            case InvoiceTemplateType.EXCEL:
                return { mime: XLSX, ext: 'xlsx' };
            case InvoiceTemplateType.PDF:
                return { mime: PDF, ext: 'pdf' };
            case InvoiceTemplateType.HTML:
                return { mime: 'text/html', ext: 'html' };
            case InvoiceTemplateType.WORD:
                return { mime: DOCX, ext: 'docx' };
            case InvoiceTemplateType.OTHER:
            default:
                return { mime: 'application/octet-stream', ext: 'bin' };
        }
    }

    private sanitizeFileName(name: string): string {
        const sanitized = name
            .replace(/[^a-zA-Z0-9\-_.\u0400-\u04FF]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .substring(0, 100)
            .trim();
        return sanitized || 'invoice-template';
    }
}
