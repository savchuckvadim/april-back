import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    PayloadTooLargeException,
} from '@nestjs/common';
import {
    SITE_MEDIA_FORMATS,
    sniffMediaFormat,
    type SiteMediaExtension,
} from './domain/media-format';
import {
    buildMediaFileName,
    mediaContentHash,
    parseMediaFileName,
} from './domain/media-file-name';
import { collectSiteMedia } from './domain/site-media-collect';
import {
    SITE_MEDIA_KEY_MAX_LENGTH,
    SITE_MEDIA_KEY_PATTERN,
    SITE_MEDIA_MAX_BYTES,
    type SiteMediaItem,
    type SiteMediaPutInput,
    type SiteMediaResolvedFile,
    type SiteMediaRole,
    type SiteMediaUpload,
} from './domain/site-media.types';
import { SiteMediaStorage } from './site-media.storage';

export const SITE_MEDIA_MESSAGES = {
    nothingUploaded: 'Нужен файл кадра или постер',
    unsupported:
        'Подходят картинки PNG, JPG, WebP и видео MP4 (H.264). Фото с iPhone (HEIC) и ролики MOV пересохраните в эти форматы',
    imageTooLarge: 'Картинка больше 10 МБ — сохраните в WebP или JPG',
    videoTooLarge:
        'Видео больше 80 МБ — сожмите (например, HandBrake: 1080p, H.264)',
    posterNotImage: 'Постер — это картинка PNG, JPG или WebP',
    posterForImage: 'Постер бывает только у видео',
    posterWithoutVideo: 'Постер ставится к видео: сначала загрузите ролик',
    slotEmpty: 'На этом месте ничего не загружено',
    posterMissing: 'У этого места нет постера',
    badKey: 'Раздел и место кадра — латиница в нижнем регистре, цифры и дефисы',
} as const;

/** Раздел и место идут в путь на диске: проверяем и здесь, а не только в DTO. */
const isMediaKey = (key: string): boolean =>
    key.length <= SITE_MEDIA_KEY_MAX_LENGTH && SITE_MEDIA_KEY_PATTERN.test(key);

const assertKeys = (...keys: string[]): void => {
    if (!keys.every(isMediaKey)) {
        throw new BadRequestException(SITE_MEDIA_MESSAGES.badKey);
    }
};

interface PreparedFile {
    name: string;
    content: Buffer;
    extension: SiteMediaExtension;
}

/**
 * Картинки и видео сайта по местам кадров: загрузка, замена, удаление и
 * список для сайта. Файлы — на диске (SiteMediaStorage), правила — здесь.
 *
 * Новый файл пишется раньше, чем удаляются старые: при сбое посередине
 * место остаётся со старым кадром, а не пустым. Кадр и постер видео
 * меняются независимо: замена ролика не трогает постер.
 */
@Injectable()
export class SiteMediaService {
    private readonly logger = new Logger(SiteMediaService.name);
    /** Загрузки в одно место идут по очереди — иначе две параллельные удалят файлы друг друга. */
    private readonly slotQueues = new Map<string, Promise<unknown>>();

    constructor(private readonly storage: SiteMediaStorage) {}

    async list(section: string): Promise<SiteMediaItem[]> {
        assertKeys(section);
        return collectSiteMedia(await this.storage.list(section));
    }

    async put(
        section: string,
        slot: string,
        input: SiteMediaPutInput,
    ): Promise<SiteMediaItem> {
        assertKeys(section, slot);
        if (!input.file && !input.poster) {
            throw new BadRequestException(SITE_MEDIA_MESSAGES.nothingUploaded);
        }
        const main = input.file
            ? this.prepare(slot, 'main', input.file)
            : undefined;
        const poster = input.poster
            ? this.prepare(slot, 'poster', input.poster)
            : undefined;
        if (
            main &&
            poster &&
            SITE_MEDIA_FORMATS[main.extension].kind !== 'video'
        ) {
            throw new BadRequestException(SITE_MEDIA_MESSAGES.posterForImage);
        }

        return this.exclusive(`${section}/${slot}`, async () => {
            const before = await this.slotFiles(section, slot);
            if (!main) {
                const current = await this.find(section, slot);
                if (current?.kind !== 'video') {
                    throw new BadRequestException(
                        SITE_MEDIA_MESSAGES.posterWithoutVideo,
                    );
                }
            }

            for (const file of [main, poster]) {
                if (file)
                    await this.storage.write(section, file.name, file.content);
            }
            await this.storage.remove(
                section,
                this.outdated(before, main, poster),
            );

            const item = await this.find(section, slot);
            if (!item) {
                throw new Error(
                    `site-media ${section}/${slot}: файл не виден после записи`,
                );
            }
            this.logger.log(
                `Медиа сайта ${section}/${slot}: ${[main?.name, poster?.name].filter(Boolean).join(', ')}`,
            );
            return item;
        });
    }

    async removePoster(section: string, slot: string): Promise<SiteMediaItem> {
        assertKeys(section, slot);
        return this.exclusive(`${section}/${slot}`, async () => {
            const item = await this.find(section, slot);
            if (!item)
                throw new NotFoundException(SITE_MEDIA_MESSAGES.slotEmpty);
            const posters = (await this.slotFiles(section, slot)).filter(
                file => file.role === 'poster',
            );
            if (posters.length === 0) {
                throw new NotFoundException(SITE_MEDIA_MESSAGES.posterMissing);
            }
            await this.storage.remove(
                section,
                posters.map(file => file.name),
            );
            this.logger.log(`Медиа сайта ${section}/${slot}: постер снят`);
            return { ...item, poster: undefined };
        });
    }

    /** Всё, что лежит у места: кадр и постер (в том числе осиротевший). */
    async remove(section: string, slot: string): Promise<void> {
        assertKeys(section, slot);
        await this.exclusive(`${section}/${slot}`, async () => {
            const files = await this.slotFiles(section, slot);
            if (files.length === 0) {
                throw new NotFoundException(SITE_MEDIA_MESSAGES.slotEmpty);
            }
            await this.storage.remove(
                section,
                files.map(file => file.name),
            );
            this.logger.log(`Медиа сайта ${section}/${slot}: удалено`);
        });
    }

    /** Файл для выдачи наружу; только имена медиа — `../` и чужие файлы не отдаются. */
    async resolveFile(
        section: string,
        name: string,
    ): Promise<SiteMediaResolvedFile | null> {
        const parsed = parseMediaFileName(name);
        if (!parsed || !isMediaKey(section)) return null;
        if (!(await this.storage.exists(section, name))) return null;
        return {
            root: this.storage.sectionDir(section),
            name,
            mime: SITE_MEDIA_FORMATS[parsed.extension].mime,
        };
    }

    private async find(
        section: string,
        slot: string,
    ): Promise<SiteMediaItem | undefined> {
        return (await this.list(section)).find(item => item.slot === slot);
    }

    /** Файлы одного места с их ролями. */
    private async slotFiles(
        section: string,
        slot: string,
    ): Promise<{ name: string; role: SiteMediaRole }[]> {
        return (await this.storage.list(section)).flatMap(file => {
            const parsed = parseMediaFileName(file.name);
            return parsed?.slot === slot
                ? [{ name: file.name, role: parsed.role }]
                : [];
        });
    }

    /**
     * Что убрать после записи: прежний кадр, если пришёл новый; прежний
     * постер, если пришёл новый или место стало картинкой (у картинки
     * постера не бывает).
     */
    private outdated(
        before: readonly { name: string; role: SiteMediaRole }[],
        main: PreparedFile | undefined,
        poster: PreparedFile | undefined,
    ): string[] {
        const becameImage =
            main !== undefined &&
            SITE_MEDIA_FORMATS[main.extension].kind === 'image';
        return before
            .filter(file =>
                file.role === 'main'
                    ? main !== undefined && file.name !== main.name
                    : (poster !== undefined && file.name !== poster.name) ||
                      becameImage,
            )
            .map(file => file.name);
    }

    /** Формат по содержимому, потолок по виду, имя с отпечатком. */
    private prepare(
        slot: string,
        role: SiteMediaRole,
        upload: SiteMediaUpload,
    ): PreparedFile {
        const extension = sniffMediaFormat(upload.buffer);
        if (!extension) {
            throw new BadRequestException(
                role === 'poster'
                    ? SITE_MEDIA_MESSAGES.posterNotImage
                    : SITE_MEDIA_MESSAGES.unsupported,
            );
        }
        const { kind } = SITE_MEDIA_FORMATS[extension];
        if (role === 'poster' && kind !== 'image') {
            throw new BadRequestException(SITE_MEDIA_MESSAGES.posterNotImage);
        }
        if (upload.buffer.length > SITE_MEDIA_MAX_BYTES[kind]) {
            throw new PayloadTooLargeException(
                kind === 'video'
                    ? SITE_MEDIA_MESSAGES.videoTooLarge
                    : SITE_MEDIA_MESSAGES.imageTooLarge,
            );
        }
        return {
            name: buildMediaFileName(
                slot,
                role,
                mediaContentHash(upload.buffer),
                extension,
            ),
            content: upload.buffer,
            extension,
        };
    }

    private exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
        const previous = this.slotQueues.get(key) ?? Promise.resolve();
        const run = previous.then(work, work);
        const settled = run.then(
            () => undefined,
            () => undefined,
        );
        this.slotQueues.set(key, settled);
        void settled.then(() => {
            if (this.slotQueues.get(key) === settled)
                this.slotQueues.delete(key);
        });
        return run;
    }
}
