import { Injectable, NotFoundException } from '@nestjs/common';
import type {
    SiteMediaItem,
    SiteMediaPutInput,
    SiteMediaStaged,
} from '../media/domain/site-media.types';
import { SiteMediaService } from '../media/site-media.service';
import { KeyedQueue } from '../shared/keyed-queue';
import {
    SITE_MEDIA_DARK_SUFFIX,
    SITE_MEDIA_LIBRARY_DIR,
} from './domain/site-media-library.const';
import type { SiteMediaLibraryUpload } from './domain/site-media-library.types';

const darkSlot = (id: string): string => `${id}${SITE_MEDIA_DARK_SUFFIX}`;

/**
 * Файлы медиатеки на диске — поверх готового хранилища картинок сайта
 * (SiteMediaService, раздел `library`): `<id>.<отпечаток>.<расш>`, постер
 * `<id>.poster.…`, тёмный вариант — место `<id>-dark`. Запись через
 * временный файл, проверка формата по первым байтам и потолки — там.
 *
 * Новое медиа пишется `put` (прежних файлов нет). Замена у существующего —
 * `stage…`: новый файл ложится рядом с прежним, а что убрать (прежний или
 * новый) решает сервис после правки строки (`discardFiles`).
 *
 * Здесь же очередь по id медиа: запись файла и правка строки идут одной
 * задачей, иначе две быстрые замены перемешаются.
 */
@Injectable()
export class SiteMediaLibraryDisk {
    private readonly queue = new KeyedQueue();

    constructor(private readonly media: SiteMediaService) {}

    exclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
        return this.queue.run(id, work);
    }

    putMain(id: string, input: SiteMediaPutInput): Promise<SiteMediaItem> {
        return this.media.put(SITE_MEDIA_LIBRARY_DIR, id, input);
    }

    putDark(id: string, file: SiteMediaLibraryUpload): Promise<SiteMediaItem> {
        return this.media.put(SITE_MEDIA_LIBRARY_DIR, darkSlot(id), { file });
    }

    /** Новый файл или постер рядом с прежним — без уборки. */
    stageMain(id: string, input: SiteMediaPutInput): Promise<SiteMediaStaged> {
        return this.media.stage(SITE_MEDIA_LIBRARY_DIR, id, input);
    }

    /** Новый тёмный вариант рядом с прежним — без уборки. */
    stageDark(
        id: string,
        file: SiteMediaLibraryUpload,
    ): Promise<SiteMediaStaged> {
        return this.media.stage(SITE_MEDIA_LIBRARY_DIR, darkSlot(id), {
            file,
        });
    }

    /** Убрать файлы медиатеки по именам (прежние после замены или новые после сбоя). */
    discardFiles(names: readonly string[]): Promise<void> {
        return this.media.discard(SITE_MEDIA_LIBRARY_DIR, names);
    }

    /** Всё, что лежит у медиа: файл, постер, тёмный вариант. Пустое место — не ошибка. */
    async discardAll(id: string): Promise<void> {
        for (const slot of [id, darkSlot(id)]) {
            try {
                await this.media.remove(SITE_MEDIA_LIBRARY_DIR, slot);
            } catch (error) {
                if (!(error instanceof NotFoundException)) throw error;
            }
        }
    }
}
