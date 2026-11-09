/**
 * Картинки и видео сайта April (кадры лендингов) — файлы на диске сервера
 * в общем storage приложений, без таблицы: имя файла и есть запись —
 * место кадра + отпечаток содержимого (см. media-file-name.ts).
 *
 * Обновляются редко, читаются сайтом раз в минуту (ISR), поэтому каталог
 * раздела — достаточная «база»: на зеркало он уезжает тем же rsync, что и
 * остальной storage.
 */

export const SITE_MEDIA_KINDS = ['image', 'video'] as const;
export type SiteMediaKind = (typeof SITE_MEDIA_KINDS)[number];

/** Роль файла у места кадра: сам кадр или постер (обложка) видео. */
export const SITE_MEDIA_ROLES = ['main', 'poster'] as const;
export type SiteMediaRole = (typeof SITE_MEDIA_ROLES)[number];

/**
 * Раздел сайта и место кадра: латиница в нижнем регистре, цифры, дефисы
 * между словами. Из них же собирается имя файла — точек и слэшей нет.
 */
export const SITE_MEDIA_KEY_SOURCE = '[a-z0-9]+(?:-[a-z0-9]+)*';
export const SITE_MEDIA_KEY_PATTERN = new RegExp(`^${SITE_MEDIA_KEY_SOURCE}$`);
export const SITE_MEDIA_KEY_MAX_LENGTH = 64;

const MB = 1024 * 1024;

/**
 * Потолок файла по виду. Скрин — до 10 МБ; ролик — до 80 МБ: на лендинге
 * больше не нужно, а nginx бэков пропускает тело до 100 МБ.
 */
export const SITE_MEDIA_MAX_BYTES = {
    image: 10 * MB,
    video: 80 * MB,
} as const satisfies Record<SiteMediaKind, number>;

/** Потолок одного файла в запросе загрузки — самый большой из видов. */
export const SITE_MEDIA_MAX_UPLOAD_BYTES = Math.max(
    ...Object.values(SITE_MEDIA_MAX_BYTES),
);

/** Подкаталог в storage/public: storage/public/site-media/<раздел>/. */
export const SITE_MEDIA_STORAGE_SUBPATH = 'site-media';

/** Файл каталога раздела, как его видит диск. */
export interface SiteMediaStoredFile {
    name: string;
    size: number;
    modifiedAt: Date;
}

/** Что сейчас стоит на месте кадра. */
export interface SiteMediaItem {
    slot: string;
    kind: SiteMediaKind;
    /** Имя файла кадра в каталоге раздела. */
    file: string;
    size: number;
    updatedAt: Date;
    /** Имя файла постера — только у видео. */
    poster?: string;
}

/** Загруженный файл: содержимое целиком (multer держит его в памяти). */
export interface SiteMediaUpload {
    buffer: Buffer;
}

/** Что пришло в одной загрузке: кадр, постер или оба. */
export interface SiteMediaPutInput {
    file?: SiteMediaUpload;
    poster?: SiteMediaUpload;
}

/**
 * Файл для выдачи наружу: каталог раздела, имя в нём и тип. Каталог и имя
 * раздельно — отдача (express sendFile с root) проверяет на «скрытые» части
 * только имя, а не весь путь сервера.
 */
export interface SiteMediaResolvedFile {
    root: string;
    name: string;
    mime: string;
}
