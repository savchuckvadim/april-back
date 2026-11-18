import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { SITE_MEDIA_FORMATS } from './domain/media-format';
import { parseMediaFileName } from './domain/media-file-name';
import {
    outdatedMediaFiles,
    prepareMediaFile,
    type PreparedMediaFile,
    type SlotMediaFile,
} from './domain/media-upload.prepare';
import { collectSiteMedia } from './domain/site-media-collect';
import { SITE_MEDIA_MESSAGES } from './domain/site-media.messages';
import {
    SITE_MEDIA_KEY_MAX_LENGTH,
    SITE_MEDIA_KEY_PATTERN,
    type SiteMediaItem,
    type SiteMediaPutInput,
    type SiteMediaResolvedFile,
    type SiteMediaStaged,
} from './domain/site-media.types';
import { SiteMediaStorage } from './site-media.storage';

export { SITE_MEDIA_MESSAGES } from './domain/site-media.messages';

/** Раздел и место идут в путь на диске: проверяем и здесь, а не только в DTO. */
const isMediaKey = (key: string): boolean =>
    key.length <= SITE_MEDIA_KEY_MAX_LENGTH && SITE_MEDIA_KEY_PATTERN.test(key);

const assertKeys = (...keys: string[]): void => {
    if (!keys.every(isMediaKey)) {
        throw new BadRequestException(SITE_MEDIA_MESSAGES.badKey);
    }
};

interface PreparedInput {
    main?: PreparedMediaFile;
    poster?: PreparedMediaFile;
}

/**
 * Картинки и видео сайта по местам кадров: загрузка, замена, удаление и
 * список для сайта. Файлы — на диске (SiteMediaStorage), правила — здесь.
 *
 * Новый файл пишется раньше, чем удаляются старые: при сбое посередине
 * место остаётся со старым кадром, а не пустым. Кадр и постер видео
 * меняются независимо: замена ролика не трогает постер.
 *
 * `put` убирает прежние файлы сразу (кадры /platform). `stage` + `discard`
 * — для медиатеки: прежние файлы убираются только после правки строки базы.
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
        const { main, poster } = this.prepareInput(section, slot, input);
        return this.exclusive(`${section}/${slot}`, async () => {
            const staged = await this.writeSlot(section, slot, main, poster);
            await this.storage.remove(section, staged.outdated);

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

    /**
     * Запись без уборки: новые файлы на диске, прежние на месте. Что убрать
     * потом — решает вызывающий (`discard` по `outdated` или по `created`).
     */
    async stage(
        section: string,
        slot: string,
        input: SiteMediaPutInput,
    ): Promise<SiteMediaStaged> {
        const { main, poster } = this.prepareInput(section, slot, input);
        return this.exclusive(`${section}/${slot}`, () =>
            this.writeSlot(section, slot, main, poster),
        );
    }

    /** Убрать файлы раздела по именам; имена не медиа (`../`, чужие) пропускаются. */
    async discard(section: string, names: readonly string[]): Promise<void> {
        assertKeys(section);
        const safe = names.filter(name => parseMediaFileName(name) !== null);
        if (safe.length > 0) await this.storage.remove(section, safe);
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

    /** Проверки до очереди: ключи, наличие файла, формат и потолки. */
    private prepareInput(
        section: string,
        slot: string,
        input: SiteMediaPutInput,
    ): PreparedInput {
        assertKeys(section, slot);
        if (!input.file && !input.poster) {
            throw new BadRequestException(SITE_MEDIA_MESSAGES.nothingUploaded);
        }
        const main = input.file
            ? prepareMediaFile(slot, 'main', input.file)
            : undefined;
        const poster = input.poster
            ? prepareMediaFile(slot, 'poster', input.poster)
            : undefined;
        if (
            main &&
            poster &&
            SITE_MEDIA_FORMATS[main.extension].kind !== 'video'
        ) {
            throw new BadRequestException(SITE_MEDIA_MESSAGES.posterForImage);
        }
        return { main, poster };
    }

    /** Запись новых файлов места (внутри очереди места); прежние не трогаются. */
    private async writeSlot(
        section: string,
        slot: string,
        main: PreparedMediaFile | undefined,
        poster: PreparedMediaFile | undefined,
    ): Promise<SiteMediaStaged> {
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
        const existed = new Set(before.map(file => file.name));
        return {
            ...(main ? { file: main.name } : {}),
            ...(poster ? { poster: poster.name } : {}),
            created: [main, poster]
                .flatMap(file => (file ? [file.name] : []))
                .filter(name => !existed.has(name)),
            outdated: outdatedMediaFiles(before, main, poster),
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
    ): Promise<SlotMediaFile[]> {
        return (await this.storage.list(section)).flatMap(file => {
            const parsed = parseMediaFileName(file.name);
            return parsed?.slot === slot
                ? [{ name: file.name, role: parsed.role }]
                : [];
        });
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
