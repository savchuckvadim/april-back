import { Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { buildContentDispositionAttachment } from '@lib/core/http/content-disposition.util';
import { StorageService } from '@lib/core/storage/storage.service';
import { SupplyReportTemplateCrudService } from './supply-report-template-crud.service';

const DOCX =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Отдача файла шаблона. Вынесено из CRUD-сервиса: работа с `Response`,
 * заголовками и хранилищем — другая ответственность, и держать её вместе
 * с бизнес-логикой значит мешать домен с транспортом.
 *
 * Шаблоны читаются из `StorageType.APP` (в `file_path` лежит уже полный
 * путь, собранный `StorageService.saveFile`), поэтому тип хранилища здесь
 * не нужен.
 */
@Injectable()
export class SupplyReportTemplateDownloadService {
    constructor(
        private readonly crudService: SupplyReportTemplateCrudService,
        private readonly storageService: StorageService,
    ) {}

    async downloadById(id: bigint, res: Response, demo = false): Promise<void> {
        const meta = await this.crudService.getFileForDownload(id, demo);

        if (!(await this.storageService.fileExists(meta.file_path))) {
            throw new NotFoundException('Файл шаблона не найден в хранилище');
        }

        const buffer = await this.storageService.readFile(meta.file_path);
        const baseName = this.sanitizeFileName(meta.name);
        const fileName = `${baseName}${demo ? '-demo' : ''}.docx`;

        res.setHeader('Content-Type', DOCX);
        res.setHeader(
            'Content-Disposition',
            buildContentDispositionAttachment(fileName),
        );
        res.setHeader('Content-Length', String(buffer.length));
        res.end(buffer);
    }

    /** Имя шаблона приходит от администратора — чистим под файловую систему. */
    private sanitizeFileName(name: string): string {
        const sanitized = name
            .replace(/[^a-zA-Z0-9\-_.Ѐ-ӿ]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .substring(0, 100)
            .trim();
        return sanitized || 'supply-report-template';
    }
}
