import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { SITE_MEDIA_LIBRARY_MESSAGES } from './domain/site-media-library.messages';
import type {
    SiteMediaLibraryUpload,
    SiteMediaRecord,
    SiteMediaVideoMeta,
} from './domain/site-media-library.types';
import {
    fileFieldsOf,
    requireDarkImage,
    requireUploadInfo,
} from './site-media-file-fields';
import { SiteMediaLibraryDisk } from './site-media-library.disk';
import { SiteMediaLibraryRepository } from './site-media-library.repository';
import { SiteMediaLibraryService } from './site-media-library.service';

const badRequest = (message: string): never => {
    throw new BadRequestException(message);
};

/**
 * Файлы уже загруженного медиа: замена самого файла, постер ролика и тёмный
 * вариант картинки. Каждая операция — под очередью id медиа: файл на диск,
 * затем строка. Новое имя файла (с отпечатком содержимого) — новый адрес,
 * поэтому кэш сайта и браузеров замене не мешает; прежний файл убирает
 * SiteMediaService после записи нового.
 */
@Injectable()
export class SiteMediaLibraryFilesService {
    private readonly logger = new Logger(SiteMediaLibraryFilesService.name);

    constructor(
        private readonly library: SiteMediaLibraryService,
        private readonly repository: SiteMediaLibraryRepository,
        private readonly disk: SiteMediaLibraryDisk,
    ) {}

    /** Картинку меняют картинкой, ролик — роликом; постер и тёмный вариант остаются. */
    replaceFile(
        id: string,
        upload: SiteMediaLibraryUpload,
        video: SiteMediaVideoMeta,
    ): Promise<SiteMediaRecord> {
        return this.disk.exclusive(id, async () => {
            const current = await this.library.get(id);
            if (current.kind === 'embed') {
                badRequest(SITE_MEDIA_LIBRARY_MESSAGES.noFileForEmbed);
            }
            const info = requireUploadInfo(upload);
            if (info.kind !== current.kind) {
                badRequest(SITE_MEDIA_LIBRARY_MESSAGES.kindChanged);
            }
            const fields = await fileFieldsOf(upload, info, video);
            const item = await this.disk.putMain(id, { file: upload });
            this.logger.log(`Медиатека: заменён файл ${id}`);
            return this.repository.update(id, {
                ...fields,
                fileName: item.file,
            });
        });
    }

    setPoster(
        id: string,
        poster: SiteMediaLibraryUpload,
    ): Promise<SiteMediaRecord> {
        return this.disk.exclusive(id, async () => {
            await this.requireKind(id, 'video');
            const item = await this.disk.putMain(id, { poster });
            return this.repository.update(id, {
                posterFileName: item.poster ?? null,
            });
        });
    }

    removePoster(id: string): Promise<SiteMediaRecord> {
        return this.disk.exclusive(id, async () => {
            const current = await this.requireKind(id, 'video');
            if (!current.posterFileName) {
                throw new NotFoundException(
                    SITE_MEDIA_LIBRARY_MESSAGES.posterMissing,
                );
            }
            await ignoreMissing(this.disk.removePoster(id));
            return this.repository.update(id, { posterFileName: null });
        });
    }

    setDark(
        id: string,
        dark: SiteMediaLibraryUpload,
    ): Promise<SiteMediaRecord> {
        return this.disk.exclusive(id, async () => {
            await this.requireKind(id, 'image');
            await requireDarkImage(dark);
            const item = await this.disk.putDark(id, dark);
            return this.repository.update(id, { darkFileName: item.file });
        });
    }

    removeDark(id: string): Promise<SiteMediaRecord> {
        return this.disk.exclusive(id, async () => {
            const current = await this.requireKind(id, 'image');
            if (!current.darkFileName) {
                throw new NotFoundException(
                    SITE_MEDIA_LIBRARY_MESSAGES.darkMissing,
                );
            }
            await ignoreMissing(this.disk.removeDark(id));
            return this.repository.update(id, { darkFileName: null });
        });
    }

    private async requireKind(
        id: string,
        kind: 'image' | 'video',
    ): Promise<SiteMediaRecord> {
        const record = await this.library.get(id);
        if (record.kind !== kind) {
            badRequest(
                kind === 'video'
                    ? SITE_MEDIA_LIBRARY_MESSAGES.posterOnlyForVideo
                    : SITE_MEDIA_LIBRARY_MESSAGES.darkOnlyForImage,
            );
        }
        return record;
    }
}

/** Файла уже нет на диске — строку всё равно приводим в порядок. */
async function ignoreMissing(work: Promise<void>): Promise<void> {
    try {
        await work;
    } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
    }
}
