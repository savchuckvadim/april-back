/**
 * Медиатека сайта (таблица site_media, миграция online 2026_11_18_100000):
 * картинки, ролики MP4 на нашем сервере и внешние видео для статей всех
 * разделов. Перечни видов и поставщиков — здесь, в базе они строки:
 * новое значение добавляется без миграции.
 */

import { SITE_MEDIA_LIBRARY_SECTION } from '../../media/domain/site-media.sections';

/**
 * Вид медиа:
 * - image — картинка (скрин), файл обязателен;
 * - video — ролик MP4 на нашем сервере; внешняя ссылка — запасная;
 * - embed — только внешнее видео, файла нет.
 */
export const SITE_MEDIA_LIBRARY_KINDS = ['image', 'video', 'embed'] as const;
export type SiteMediaLibraryKind = (typeof SITE_MEDIA_LIBRARY_KINDS)[number];

/** Виды, у которых есть файл на нашем сервере. */
export const SITE_MEDIA_FILE_KINDS = [
    'image',
    'video',
] as const satisfies readonly SiteMediaLibraryKind[];
export type SiteMediaFileKind = (typeof SITE_MEDIA_FILE_KINDS)[number];

/**
 * Поставщики внешнего видео. Адрес встраивания сайт собирает сам по
 * поставщику и id ролика — произвольный iframe из базы на страницу не попадает.
 */
export const SITE_MEDIA_EMBED_PROVIDERS = ['youtube', 'rutube', 'vk'] as const;
export type SiteMediaEmbedProvider =
    (typeof SITE_MEDIA_EMBED_PROVIDERS)[number];

/**
 * Раздел хранилища картинок сайта: storage/public/site-media/library/.
 * Один источник с перечнем разделов, закрытых для старых ручек кадров.
 */
export const SITE_MEDIA_LIBRARY_DIR = SITE_MEDIA_LIBRARY_SECTION;

/** Место тёмного варианта картинки: `<id>-dark` рядом с `<id>`. */
export const SITE_MEDIA_DARK_SUFFIX = '-dark';

/** Адрес файла на сайте: сайт проксирует его со своего /media/<раздел>/<файл>. */
export const SITE_MEDIA_LIBRARY_PUBLIC_PATH = `/media/${SITE_MEDIA_LIBRARY_DIR}`;

/** Потолки полей — по колонкам site_media. */
export const SITE_MEDIA_LIBRARY_LIMITS = {
    title: 255,
    caption: 500,
    alt: 500,
    embedUrl: 500,
    embedId: 64,
    /** UNSIGNED SMALLINT — сторона картинки и ролика. */
    side: 65535,
    /** Сутки — заведомо больше любого ролика сайта. */
    durationSec: 24 * 60 * 60,
    search: 100,
} as const;

/** Медиатека в админке — постранично. */
export const SITE_MEDIA_LIBRARY_PAGE = {
    defaultSize: 50,
    maxSize: 200,
} as const;
