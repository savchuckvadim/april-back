import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import { StorageService, StorageType } from '@lib/core/storage';
import { ProviderImageFormat } from './provider-image.entity';

/** Каталог картинок поставщика внутри `storage/app`. */
export const PROVIDER_IMAGE_STORAGE_SUBPATH = 'konstructor/provider-images';

const isMissing = (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT';

/**
 * Файлы картинок поставщика в `storage/app/konstructor/provider-images/{rqId}/`.
 *
 * Только файловые операции, без правил: что проверять и когда удалять, решает
 * ProviderImageService. В базе лежит путь внутри `storage/app` (без корня
 * хранилища): запись не зависит от того, где на сервере лежит storage.
 */
@Injectable()
export class ProviderImageStorage {
    constructor(private readonly storage: StorageService) {}

    /** Путь внутри `storage/app`: `konstructor/provider-images/{rqId}/{id}.{format}` */
    relativePath(
        rqId: number,
        id: string,
        format: ProviderImageFormat,
    ): string {
        return `${PROVIDER_IMAGE_STORAGE_SUBPATH}/${rqId}/${id}.${format}`;
    }

    /**
     * Запись через временный файл и rename: пока файл дописывается, под своим
     * именем его нет, и PDF не прочитает картинку недописанной.
     */
    async write(relativePath: string, content: Buffer): Promise<void> {
        const target = this.absolutePath(relativePath);
        const dir = dirname(target);
        await mkdir(dir, { recursive: true });
        const temp = join(dir, `.upload-${randomUUID()}`);
        try {
            await writeFile(temp, content);
            await rename(temp, target);
        } catch (error) {
            await rm(temp, { force: true });
            throw error;
        }
    }

    /** Содержимое файла; null — файла нет на диске. */
    async read(relativePath: string): Promise<Buffer | null> {
        try {
            return await readFile(this.absolutePath(relativePath));
        } catch (error) {
            if (isMissing(error)) return null;
            throw error;
        }
    }

    /** Удаление терпимо к отсутствию файла: нет файла — ничего не происходит. */
    async remove(relativePath: string): Promise<void> {
        await rm(this.absolutePath(relativePath), { force: true });
    }

    /**
     * Полный путь файла. Путь из базы обязан оставаться внутри `storage/app`:
     * `..` в нём — ошибка данных, и чужие файлы по нему не читаются.
     */
    private absolutePath(relativePath: string): string {
        const root = resolve(this.storage.getFilePath(StorageType.APP, '', ''));
        const absolute = resolve(root, relativePath);
        if (!absolute.startsWith(root + sep)) {
            throw new Error(
                `Путь картинки «${relativePath}» выходит за каталог хранилища`,
            );
        }
        return absolute;
    }
}
