import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import type { SiteMediaStaged } from '../media/domain/site-media.types';
import { SITE_MEDIA_LIBRARY_MESSAGES } from './domain/site-media-library.messages';
import type {
    SiteMediaLibraryUpload,
    SiteMediaPatch,
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
 * вариант картинки. Каждая операция — под очередью id медиа.
 *
 * Порядок замены: новый файл ложится рядом с прежним → правится строка →
 * только потом убирается прежний файл. Правка строки сорвалась — убирается
 * новый, прежний остаётся действующим: строка не указывает на удалённый
 * файл ни в какой момент. Снятие постера и тёмного варианта — наоборот:
 * сначала строка, потом файл.
 *
 * Новое имя файла (с отпечатком содержимого) — новый адрес, поэтому кэш
 * сайта и браузеров замене не мешает.
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
            const record = await this.swap(
                id,
                () => this.disk.stageMain(id, { file: upload }),
                staged => ({ ...fields, fileName: staged.file }),
            );
            this.logger.log(`Медиатека: заменён файл ${id}`);
            return record;
        });
    }

    setPoster(
        id: string,
        poster: SiteMediaLibraryUpload,
    ): Promise<SiteMediaRecord> {
        return this.disk.exclusive(id, async () => {
            await this.requireKind(id, 'video');
            return this.swap(
                id,
                () => this.disk.stageMain(id, { poster }),
                staged => ({ posterFileName: staged.poster ?? null }),
            );
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
            const record = await this.repository.update(id, {
                posterFileName: null,
            });
            await this.discardQuietly(id, [current.posterFileName]);
            return record;
        });
    }

    setDark(
        id: string,
        dark: SiteMediaLibraryUpload,
    ): Promise<SiteMediaRecord> {
        return this.disk.exclusive(id, async () => {
            await this.requireKind(id, 'image');
            await requireDarkImage(dark);
            return this.swap(
                id,
                () => this.disk.stageDark(id, dark),
                staged => ({ darkFileName: staged.file ?? null }),
            );
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
            const record = await this.repository.update(id, {
                darkFileName: null,
            });
            await this.discardQuietly(id, [current.darkFileName]);
            return record;
        });
    }

    /**
     * Новый файл рядом с прежним → строка → уборка прежнего. Сорвалась
     * правка строки — убираем только то, чего до записи не было.
     */
    private async swap(
        id: string,
        stage: () => Promise<SiteMediaStaged>,
        patchOf: (staged: SiteMediaStaged) => SiteMediaPatch,
    ): Promise<SiteMediaRecord> {
        const staged = await stage();
        let record: SiteMediaRecord;
        try {
            record = await this.repository.update(id, patchOf(staged));
        } catch (error) {
            await this.discardQuietly(id, staged.created);
            throw error;
        }
        await this.discardQuietly(id, staged.outdated);
        return record;
    }

    /** Уборка файлов: сбой не должен заслонить исходную ошибку или удачную правку. */
    private async discardQuietly(
        id: string,
        names: readonly string[],
    ): Promise<void> {
        if (names.length === 0) return;
        try {
            await this.disk.discardFiles(names);
        } catch (error) {
            this.logger.warn(
                `Медиатека: файлы ${id} не убраны (${(error as Error).message})`,
            );
        }
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
