import { randomUUID } from 'node:crypto';
import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import {
    SITE_MEDIA_LIBRARY_PAGE,
    type SiteMediaFileKind,
} from './domain/site-media-library.const';
import { parseEmbedUrl } from './domain/site-media-embed.parse';
import {
    SITE_MEDIA_LIBRARY_MESSAGES,
    siteMediaInUseMessage,
} from './domain/site-media-library.messages';
import type {
    SiteMediaEmbedRef,
    SiteMediaLibraryUpload,
    SiteMediaListFilter,
    SiteMediaListPage,
    SiteMediaPatch,
    SiteMediaRecord,
    SiteMediaTexts,
    SiteMediaUsage,
    SiteMediaVideoMeta,
} from './domain/site-media-library.types';
import { cleanText, cleanTextOrNull } from '../shared/clean-text';
import {
    fileFieldsOf,
    requireDarkImage,
    requireUploadInfo,
} from './site-media-file-fields';
import { SiteMediaLibraryDisk } from './site-media-library.disk';
import { SiteMediaLibraryRepository } from './site-media-library.repository';

/** Загрузка: файл, постер ролика, тёмный вариант картинки, подписи и запасная ссылка ролика. */
export interface SiteMediaUploadInput
    extends SiteMediaTexts,
        SiteMediaVideoMeta {
    file?: SiteMediaLibraryUpload;
    poster?: SiteMediaLibraryUpload;
    dark?: SiteMediaLibraryUpload;
    embedUrl?: string | null;
}

export interface SiteMediaEmbedInput extends SiteMediaTexts {
    url: string;
}

/** Правка: подписи, размеры ролика, внешняя ссылка (null — снять). */
export interface SiteMediaEditInput extends SiteMediaTexts, SiteMediaVideoMeta {
    embedUrl?: string | null;
}

export type SiteMediaListQuery = Omit<
    SiteMediaListFilter,
    'page' | 'pageSize'
> &
    Partial<Pick<SiteMediaListFilter, 'page' | 'pageSize'>>;

const requireEmbed = (url: string): SiteMediaEmbedRef => {
    const embed = parseEmbedUrl(url);
    if (!embed) {
        throw new BadRequestException(SITE_MEDIA_LIBRARY_MESSAGES.embedUnknown);
    }
    return embed;
};

const embedFields = (url: string, embed: SiteMediaEmbedRef | null) => ({
    embedUrl: embed ? url.trim() : null,
    embedProvider: embed?.provider ?? null,
    embedId: embed?.id ?? null,
});

const textFields = (input: SiteMediaTexts) => ({
    title: cleanTextOrNull(input.title),
    caption: cleanTextOrNull(input.caption),
    alt: cleanTextOrNull(input.alt),
});

/**
 * Медиатека сайта: загрузка, внешнее видео, подписи, список, удаление.
 * Замена файла, постер и тёмный вариант — SiteMediaLibraryFilesService.
 *
 * Порядок загрузки: файл пишется раньше строки (SiteMediaService — через
 * временный файл), строка вставляется после удачной записи; вставка
 * сорвалась — файлы удаляются, сирот на диске не остаётся. Удаление —
 * наоборот: сначала строка, потом файлы.
 */
@Injectable()
export class SiteMediaLibraryService {
    private readonly logger = new Logger(SiteMediaLibraryService.name);

    constructor(
        private readonly repository: SiteMediaLibraryRepository,
        private readonly disk: SiteMediaLibraryDisk,
    ) {}

    list(query: SiteMediaListQuery): Promise<SiteMediaListPage> {
        const pageSize = Math.min(
            Math.max(1, query.pageSize ?? SITE_MEDIA_LIBRARY_PAGE.defaultSize),
            SITE_MEDIA_LIBRARY_PAGE.maxSize,
        );
        return this.repository.list({
            ...query,
            page: Math.max(1, query.page ?? 1),
            pageSize,
        });
    }

    async get(id: string): Promise<SiteMediaRecord> {
        const record = await this.repository.findById(id);
        if (!record) {
            throw new NotFoundException(SITE_MEDIA_LIBRARY_MESSAGES.notFound);
        }
        return record;
    }

    async usage(id: string): Promise<SiteMediaUsage[]> {
        await this.get(id);
        return this.repository.usage(id);
    }

    async upload(
        input: SiteMediaUploadInput,
        by: string | null,
    ): Promise<SiteMediaRecord> {
        if (!input.file) {
            throw new BadRequestException(
                SITE_MEDIA_LIBRARY_MESSAGES.fileRequired,
            );
        }
        const info = requireUploadInfo(input.file);
        this.checkExtras(info.kind, input);
        const file = await fileFieldsOf(input.file, info, input);
        if (input.dark) await requireDarkImage(input.dark);
        const embedUrl = input.embedUrl?.trim();
        const embed = embedUrl ? requireEmbed(embedUrl) : null;

        const id = randomUUID();
        try {
            const main = await this.disk.putMain(id, {
                file: input.file,
                poster: input.poster,
            });
            const dark = input.dark
                ? await this.disk.putDark(id, input.dark)
                : undefined;
            const record = await this.repository.create({
                id,
                kind: info.kind,
                ...textFields(input),
                ...file,
                fileName: main.file,
                darkFileName: dark?.file ?? null,
                posterFileName: main.poster ?? null,
                ...embedFields(embedUrl ?? '', embed),
                uploadedBy: by,
            });
            this.logger.log(`Медиатека: загружено ${id} (${info.kind})`);
            return record;
        } catch (error) {
            await this.discardQuietly(id);
            throw error;
        }
    }

    async createEmbed(
        input: SiteMediaEmbedInput,
        by: string | null,
    ): Promise<SiteMediaRecord> {
        const embed = requireEmbed(input.url);
        return this.repository.create({
            id: randomUUID(),
            kind: 'embed',
            ...textFields(input),
            fileName: null,
            darkFileName: null,
            posterFileName: null,
            mime: null,
            sizeBytes: null,
            width: null,
            height: null,
            durationSec: null,
            ...embedFields(input.url, embed),
            uploadedBy: by,
        });
    }

    edit(id: string, input: SiteMediaEditInput): Promise<SiteMediaRecord> {
        return this.disk.exclusive(id, async () => {
            const current = await this.get(id);
            const patch: SiteMediaPatch = {
                title: cleanText(input.title),
                caption: cleanText(input.caption),
                alt: cleanText(input.alt),
                ...this.videoPatch(current, input),
                ...this.embedPatch(current, input.embedUrl),
            };
            return this.repository.update(id, patch);
        });
    }

    /** Удалить можно только медиа, которое не стоит ни в одной статье. */
    remove(id: string): Promise<void> {
        return this.disk.exclusive(id, async () => {
            await this.get(id);
            const usages = await this.repository.usage(id);
            if (usages.length > 0) {
                throw new ConflictException(siteMediaInUseMessage(usages));
            }
            await this.repository.remove(id);
            await this.discardQuietly(id);
            this.logger.log(`Медиатека: удалено ${id}`);
        });
    }

    /** Постер — только к ролику, тёмный вариант — только к картинке. */
    private checkExtras(kind: SiteMediaFileKind, input: SiteMediaUploadInput) {
        if (input.poster && kind !== 'video') {
            throw new BadRequestException(
                SITE_MEDIA_LIBRARY_MESSAGES.posterOnlyForVideo,
            );
        }
        if (input.dark && kind !== 'image') {
            throw new BadRequestException(
                SITE_MEDIA_LIBRARY_MESSAGES.darkOnlyForImage,
            );
        }
        if (input.embedUrl?.trim() && kind !== 'video') {
            throw new BadRequestException(
                SITE_MEDIA_LIBRARY_MESSAGES.embedOnlyForVideo,
            );
        }
    }

    private videoPatch(
        current: SiteMediaRecord,
        input: SiteMediaVideoMeta,
    ): SiteMediaPatch {
        const { width, height, durationSec } = input;
        const given = [width, height, durationSec].some(v => v !== undefined);
        if (!given) return {};
        if (current.kind !== 'video') {
            throw new BadRequestException(
                SITE_MEDIA_LIBRARY_MESSAGES.videoMetaForImage,
            );
        }
        return { width, height, durationSec };
    }

    private embedPatch(
        current: SiteMediaRecord,
        url: string | null | undefined,
    ): SiteMediaPatch {
        if (url === undefined) return {};
        if (current.kind === 'image') {
            throw new BadRequestException(
                SITE_MEDIA_LIBRARY_MESSAGES.embedOnlyForVideo,
            );
        }
        const text = url?.trim() ?? '';
        if (!text && current.kind === 'embed') {
            throw new BadRequestException(
                SITE_MEDIA_LIBRARY_MESSAGES.embedRequired,
            );
        }
        return embedFields(text, text ? requireEmbed(text) : null);
    }

    /** Откат файлов: сбой уборки не должен заслонить исходную ошибку. */
    private async discardQuietly(id: string): Promise<void> {
        try {
            await this.disk.discard(id);
        } catch (error) {
            this.logger.warn(
                `Медиатека: файлы ${id} не убраны (${(error as Error).message})`,
            );
        }
    }
}
