import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageService, StorageType } from '@lib/core/storage/storage.service';
import { validateDocxFile } from '@app/konstructor/modules/offer-template/word/lib/file-validator';

const STORAGE_SUBPATH = 'konstructor/supply-report-templates';

/** Файлы, пришедшие из `FileFieldsInterceptor`. */
export type SupplyReportTemplateUploads = {
    file?: Express.Multer.File;
    demo?: Express.Multer.File;
};

/**
 * Работа с файлами шаблона: проверка, сохранение, замена, удаление.
 *
 * Отдельный сервис, а не приватные методы CRUD-сервиса: хранилище — это
 * инфраструктура, и держать её рядом с доменными правилами (область
 * шаблона, флаг «по умолчанию») значит смешивать ответственности и
 * раздувать класс за допустимые 200–300 строк.
 */
@Injectable()
export class SupplyReportTemplateFilesService {
    constructor(private readonly storageService: StorageService) {}

    /**
     * Проверка загрузок ДО любых записей.
     *
     * Вызывается до сохранения в хранилище: иначе отказ по невалидному демо
     * оставил бы в хранилище осиротевший основной файл.
     */
    assertUploadsValid(
        uploads: SupplyReportTemplateUploads,
        requireFile: boolean,
    ): void {
        if (requireFile) {
            validateDocxFile(uploads.file);
            if (!uploads.file) {
                throw new BadRequestException('Нужен файл шаблона (.docx)');
            }
        } else if (uploads.file) {
            validateDocxFile(uploads.file);
        }
        if (uploads.demo) {
            validateDocxFile(uploads.demo);
        }
    }

    /** Имя в хранилище: UUID + расширение (без кириллицы в пути). */
    async save(file: Express.Multer.File): Promise<string> {
        const extMatch = /\.([a-zA-Z0-9]{1,10})$/.exec(file.originalname);
        const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '.docx';
        return this.storageService.saveFile(
            file.buffer,
            `${randomUUID()}${ext}`,
            StorageType.APP,
            STORAGE_SUBPATH,
        );
    }

    /** Сохранить новый файл и убрать предыдущий. */
    async replace(
        file: Express.Multer.File,
        previousPath: string | null,
    ): Promise<string> {
        const saved = await this.save(file);
        await this.remove(previousPath);
        return saved;
    }

    /**
     * Удаление файла не должно ронять операцию: запись в БД важнее, а
     * отсутствующий файл — не причина отказать в удалении шаблона.
     */
    async remove(path: string | null): Promise<void> {
        if (!path) {
            return;
        }
        try {
            await this.storageService.deleteFile(path);
        } catch {
            // Файла нет или нет прав — осиротевший файл безвреден.
        }
    }
}
