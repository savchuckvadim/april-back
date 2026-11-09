import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { StorageService, StorageType } from '@lib/core/storage';
import {
    SITE_MEDIA_STORAGE_SUBPATH,
    type SiteMediaStoredFile,
} from './domain/site-media.types';

const isMissing = (error: unknown): boolean =>
    (error as NodeJS.ErrnoException).code === 'ENOENT';

/**
 * Каталог раздела на диске: storage/public/site-media/<раздел>/.
 *
 * Только файловые операции, без правил: какие имена допустимы и что
 * удалять, решает SiteMediaService. Корень storage — общий для всех
 * приложений (bind mount), поэтому записанное админкой сразу видит bot.
 */
@Injectable()
export class SiteMediaStorage {
    constructor(private readonly storage: StorageService) {}

    sectionDir(section: string): string {
        return resolve(
            this.storage.getFilePath(
                StorageType.PUBLIC,
                SITE_MEDIA_STORAGE_SUBPATH,
                section,
            ),
        );
    }

    /** Файлы раздела; нет каталога — пусто (в разделе ещё ничего не загружали). */
    async list(section: string): Promise<SiteMediaStoredFile[]> {
        const dir = this.sectionDir(section);
        let names: string[];
        try {
            names = await readdir(dir);
        } catch (error) {
            if (isMissing(error)) return [];
            throw error;
        }
        const files = await Promise.all(
            names.map(async (name): Promise<SiteMediaStoredFile | null> => {
                try {
                    const info = await stat(join(dir, name));
                    return info.isFile()
                        ? { name, size: info.size, modifiedAt: info.mtime }
                        : null;
                } catch (error) {
                    // Файл удалили между readdir и stat — его просто нет.
                    if (isMissing(error)) return null;
                    throw error;
                }
            }),
        );
        return files.filter(
            (file): file is SiteMediaStoredFile => file !== null,
        );
    }

    /**
     * Запись через временный файл и rename: пока ролик дописывается, в
     * каталоге нет файла с именем медиа, и сайт не отдаст его недописанным.
     */
    async write(section: string, name: string, content: Buffer): Promise<void> {
        const dir = this.sectionDir(section);
        await mkdir(dir, { recursive: true });
        const temp = join(dir, `.upload-${randomUUID()}`);
        try {
            await writeFile(temp, content);
            await rename(temp, join(dir, name));
        } catch (error) {
            await rm(temp, { force: true });
            throw error;
        }
    }

    async remove(section: string, names: readonly string[]): Promise<void> {
        const dir = this.sectionDir(section);
        await Promise.all(
            names.map(name => rm(join(dir, name), { force: true })),
        );
    }

    async exists(section: string, name: string): Promise<boolean> {
        try {
            return (await stat(join(this.sectionDir(section), name))).isFile();
        } catch (error) {
            if (isMissing(error)) return false;
            throw error;
        }
    }
}
