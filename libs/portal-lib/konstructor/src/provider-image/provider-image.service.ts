import { randomUUID } from 'crypto';
import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import {
    ProviderImageContent,
    ProviderImageEntity,
    ProviderImageFormat,
} from './provider-image.entity';
import { PROVIDER_IMAGE_MESSAGES } from './provider-image.messages';
import { isProviderImageRole, ProviderImageRole } from './provider-image.role';
import { ProviderImageRepository } from './provider-image.repository';
import { ProviderImageStorage } from './provider-image.storage';
import {
    cleanUploadName,
    PROVIDER_IMAGE_MAX_BYTES,
    PROVIDER_IMAGE_MAX_SIDE,
    readProviderImageSize,
    sniffProviderImageFormat,
} from './lib/provider-image-file.util';

/** Загруженный файл: содержимое и имя, с которым его прислали. */
export interface ProviderImageUpload {
    buffer: Buffer | undefined;
    originalName?: string;
}

/** Загрузка после проверок: то, что идёт на диск и в запись. */
interface PreparedUpload {
    format: ProviderImageFormat;
    content: Buffer;
    width: number;
    height: number;
    originalName: string | null;
}

/** Файл картинки вместе с её записью: для отдачи в админку. */
export interface ProviderImageFile {
    image: ProviderImageEntity;
    content: Buffer;
}

const errorText = (error: unknown): string =>
    (error instanceof Error ? error.message : String(error))
        .replace(/\s+/g, ' ')
        .trim();

/**
 * Картинки поставщика (печать, подписи, логотип): правила записи поверх
 * репозитория и файлового хранилища.
 *
 * Новый файл пишется раньше, чем удаляется прежний: при сбое посередине у
 * реквизитов остаётся старая картинка. Загрузки в одну пару «реквизиты и
 * роль» идут по очереди, иначе две параллельные удалили бы файлы друг друга.
 */
@Injectable()
export class ProviderImageService {
    private readonly logger = new Logger(ProviderImageService.name);
    private readonly queues = new Map<string, Promise<unknown>>();

    constructor(
        private readonly images: ProviderImageRepository,
        private readonly storage: ProviderImageStorage,
    ) {}

    /** Картинки реквизитов по порядку ролей. Нет реквизитов — 404. */
    async list(rqId: number): Promise<ProviderImageEntity[]> {
        await this.assertRq(rqId);
        return this.images.findByRq(rqId);
    }

    /** Запись картинки; нет такой — 404. */
    async get(rqId: number, roleInput: string): Promise<ProviderImageEntity> {
        const role = this.parseRole(roleInput);
        this.checkRqId(rqId);
        const image = await this.images.find(rqId, role);
        if (!image) {
            throw new NotFoundException(
                PROVIDER_IMAGE_MESSAGES.imageNotFound(rqId, role),
            );
        }
        return image;
    }

    /** Файл картинки для превью в админке; нет записи или файла — 404. */
    async readFile(
        rqId: number,
        roleInput: string,
    ): Promise<ProviderImageFile> {
        const image = await this.get(rqId, roleInput);
        const content = await this.storage.read(image.path);
        if (!content) {
            throw new NotFoundException(
                PROVIDER_IMAGE_MESSAGES.fileMissing(rqId, image.role),
            );
        }
        return { image, content };
    }

    /** Загрузка или замена картинки роли. */
    async put(
        rqId: number,
        roleInput: string,
        upload: ProviderImageUpload,
    ): Promise<ProviderImageEntity> {
        const role = this.parseRole(roleInput);
        this.checkRqId(rqId);
        const prepared = await this.prepareUpload(upload);
        await this.assertRq(rqId);

        return this.exclusive(`${rqId}/${role}`, async () => {
            const previous = await this.images.find(rqId, role);
            const id = randomUUID();
            const path = this.storage.relativePath(rqId, id, prepared.format);

            await this.storage.write(path, prepared.content);
            let saved: ProviderImageEntity;
            try {
                saved = await this.images.upsert({
                    id,
                    rqId,
                    role,
                    path,
                    format: prepared.format,
                    width: prepared.width,
                    height: prepared.height,
                    size: prepared.content.length,
                    originalName: prepared.originalName,
                });
            } catch (error) {
                await this.discardFile(path);
                throw error;
            }
            if (previous && previous.path !== path) {
                await this.discardFile(previous.path);
            }
            this.logger.log(
                `Картинка поставщика ${role}, реквизиты ${rqId}: ${path}`,
            );
            return saved;
        });
    }

    /** Удаляет запись и файл. Файла на диске уже нет — запись всё равно удаляется. */
    async remove(rqId: number, roleInput: string): Promise<void> {
        const role = this.parseRole(roleInput);
        this.checkRqId(rqId);
        await this.exclusive(`${rqId}/${role}`, async () => {
            const image = await this.images.find(rqId, role);
            if (!image) {
                throw new NotFoundException(
                    PROVIDER_IMAGE_MESSAGES.imageNotFound(rqId, role),
                );
            }
            await this.images.delete(rqId, role);
            await this.discardFile(image.path);
            this.logger.log(
                `Картинка поставщика ${role}, реквизиты ${rqId}: удалена`,
            );
        });
    }

    /**
     * Содержимое картинок указанных ролей для печати в документе. Нет файла на
     * диске — картинка пропускается, в лог уходит одна строка. Ошибка чтения
     * записей (например, нет таблицы) уходит вызывающему: решать, что делать с
     * документом, ему.
     */
    async loadContents(
        rqId: number,
        roles: readonly ProviderImageRole[],
    ): Promise<ProviderImageContent[]> {
        const images = (await this.images.findByRq(rqId)).filter(image =>
            roles.includes(image.role),
        );
        const contents = await Promise.all(
            images.map(image => this.readContent(image)),
        );
        return contents.flatMap(content => (content ? [content] : []));
    }

    private async readContent(
        image: ProviderImageEntity,
    ): Promise<ProviderImageContent | null> {
        try {
            const data = await this.storage.read(image.path);
            if (data) return { role: image.role, format: image.format, data };
            this.logger.warn(
                `Файл картинки поставщика ${image.role} (реквизиты ${image.rqId}) не найден: ${image.path}`,
            );
        } catch (error) {
            this.logger.warn(
                `Файл картинки поставщика ${image.role} (реквизиты ${image.rqId}) не прочитан: ${errorText(error)}`,
            );
        }
        return null;
    }

    /** Формат по содержимому, размер файла, размеры в пикселях. */
    private async prepareUpload(
        upload: ProviderImageUpload,
    ): Promise<PreparedUpload> {
        const { buffer } = upload;
        if (!buffer || buffer.length === 0) {
            throw new BadRequestException(PROVIDER_IMAGE_MESSAGES.noFile);
        }
        if (buffer.length > PROVIDER_IMAGE_MAX_BYTES) {
            throw new BadRequestException(PROVIDER_IMAGE_MESSAGES.tooLarge);
        }
        const format = sniffProviderImageFormat(buffer);
        if (!format) {
            throw new BadRequestException(
                PROVIDER_IMAGE_MESSAGES.unsupportedFormat,
            );
        }
        const size = await readProviderImageSize(buffer);
        if (!size) {
            throw new BadRequestException(PROVIDER_IMAGE_MESSAGES.unreadable);
        }
        if (
            size.width > PROVIDER_IMAGE_MAX_SIDE ||
            size.height > PROVIDER_IMAGE_MAX_SIDE
        ) {
            throw new BadRequestException(PROVIDER_IMAGE_MESSAGES.tooBig);
        }
        return {
            format,
            content: buffer,
            width: size.width,
            height: size.height,
            originalName: cleanUploadName(upload.originalName),
        };
    }

    /**
     * Лишний файл убирается без права уронить операцию: запись в базе уже
     * приведена в порядок, остаток на диске — мусор, о котором достаточно
     * строки в логе.
     */
    private async discardFile(path: string): Promise<void> {
        try {
            await this.storage.remove(path);
        } catch (error) {
            this.logger.warn(
                `Файл картинки поставщика ${path} не удалён: ${errorText(error)}`,
            );
        }
    }

    private parseRole(role: string): ProviderImageRole {
        if (!isProviderImageRole(role)) {
            throw new BadRequestException(
                PROVIDER_IMAGE_MESSAGES.unknownRole(role),
            );
        }
        return role;
    }

    private checkRqId(rqId: number): void {
        if (!Number.isInteger(rqId) || rqId < 1) {
            throw new BadRequestException(PROVIDER_IMAGE_MESSAGES.badRq);
        }
    }

    private async assertRq(rqId: number): Promise<void> {
        this.checkRqId(rqId);
        if (!(await this.images.rqExists(rqId))) {
            throw new NotFoundException(
                PROVIDER_IMAGE_MESSAGES.rqNotFound(rqId),
            );
        }
    }

    private exclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
        const previous = this.queues.get(key) ?? Promise.resolve();
        const run = previous.then(task, task);
        const tail = run.catch(() => undefined);
        this.queues.set(key, tail);
        void tail.then(() => {
            if (this.queues.get(key) === tail) this.queues.delete(key);
        });
        return run;
    }
}
