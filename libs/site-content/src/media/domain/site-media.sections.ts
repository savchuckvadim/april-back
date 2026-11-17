/**
 * Раздел медиатеки статей (таблица site_media): имя файла там — uuid строки
 * базы, а не место кадра, и файлами управляют ручки медиатеки.
 */
export const SITE_MEDIA_LIBRARY_SECTION = 'library';

/**
 * Разделы, закрытые для старых ручек кадров по местам: перечень
 * `GET site-media/:section` для них не отдаётся (404), загрузка и удаление
 * через `admin/site-media/:section/:slot` — отказ. Сами файлы по адресу
 * `site-media/:section/files/<имя>` отдаются как прежде: их адреса сайт
 * получает из ответа статьи.
 */
export const SITE_MEDIA_CLOSED_SECTIONS = [SITE_MEDIA_LIBRARY_SECTION] as const;

export const isClosedMediaSection = (section: string): boolean =>
    (SITE_MEDIA_CLOSED_SECTIONS as readonly string[]).includes(section);

export const SITE_MEDIA_CLOSED_SECTION_MESSAGES = {
    admin: 'Файлы медиатеки меняются в разделе «Медиатека»',
    publicList: 'Такого раздела картинок нет',
} as const;
