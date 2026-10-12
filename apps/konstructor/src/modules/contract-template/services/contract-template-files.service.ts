import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageService, StorageType } from '@lib/core/storage/storage.service';
import { validateDocxFile } from '@app/konstructor/modules/offer-template/word/lib/file-validator';

const STORAGE_SUBPATH = 'konstructor/contract-templates';

/** Файлы, пришедшие из `FileFieldsInterceptor`. */
export type ContractTemplateUploads = {
    file?: Express.Multer.File;
    demo?: Express.Multer.File;
};

/** Результат сохранения загрузок при создании шаблона. */
export type ContractTemplateSavedPaths = {
    file_path: string;
    demo_path: string | null;
};

/**
 * Работа с файлами шаблона договора: валидация .docx, запись в хранилище,
 * замена и удаление.
 *
 * Выделено из CRUD-сервиса сознательно: хранилище — это инфраструктура, а
 * не домен, и держать её рядом с правилами «кто по умолчанию в своей
 * области» значит смешивать две ответственности в одном классе (и
 * раздувать его за лимит 200–300 строк из CLAUDE.md). Побочный плюс:
 * доменный сервис тестируется без моков `StorageService`.
 */
@Injectable()
export class ContractTemplateFilesService {
    constructor(private readonly storageService: StorageService) {}

    /**
     * Валидация загрузок при создании. Файл шаблона обязателен: без него
     * строка в БД указывала бы в пустоту, и генерация падала бы уже на
     * проде, а не на запросе администратора.
     */
    assertCreateUploads(uploads: ContractTemplateUploads): Express.Multer.File {
        const file = uploads.file;
        validateDocxFile(file);
        if (!file) {
            throw new BadRequestException('Нужен файл шаблона (.docx)');
        }
        if (uploads.demo) {
            validateDocxFile(uploads.demo);
        }
        return file;
    }

    /** Сохранить загрузки создаваемого шаблона. */
    async saveCreateUploads(
        uploads: ContractTemplateUploads,
    ): Promise<ContractTemplateSavedPaths> {
        const file = this.assertCreateUploads(uploads);
        return {
            file_path: await this.saveUpload(file),
            demo_path: uploads.demo
                ? await this.saveUpload(uploads.demo)
                : null,
        };
    }

    /**
     * Заменить файл: сначала пишем новый, потом удаляем старый. Порядок
     * важен — при падении записи старый файл остаётся на месте, и шаблон
     * продолжает работать.
     */
    async replaceUpload(
        file: Express.Multer.File,
        previousPath: string | null,
    ): Promise<string> {
        validateDocxFile(file);
        const saved = await this.saveUpload(file);
        await this.removeStoredFile(previousPath);
        return saved;
    }

    /**
     * Удаление файла не должно ронять операцию: запись в БД важнее, а
     * отсутствующий файл — не причина отказать в удалении шаблона.
     */
    async removeStoredFile(path: string | null): Promise<void> {
        if (!path) {
            return;
        }
        try {
            await this.storageService.deleteFile(path);
        } catch {
            // Файла нет или нет прав — осиротевший файл безвреден.
        }
    }

    /** Имя в хранилище: UUID + расширение (без кириллицы в пути). */
    private async saveUpload(file: Express.Multer.File): Promise<string> {
        const extMatch = /\.([a-zA-Z0-9]{1,10})$/.exec(file.originalname);
        const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '.docx';
        return this.storageService.saveFile(
            file.buffer,
            `${randomUUID()}${ext}`,
            StorageType.APP,
            STORAGE_SUBPATH,
        );
    }
}
