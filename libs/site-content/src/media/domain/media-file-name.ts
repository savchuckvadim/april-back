import { createHash } from 'crypto';
import { SITE_MEDIA_EXTENSIONS, type SiteMediaExtension } from './media-format';
import { SITE_MEDIA_KEY_SOURCE, type SiteMediaRole } from './site-media.types';

/**
 * Имя файла — запись о кадре: `<место>.<отпечаток>.<расш>`, у постера
 * видео — `<место>.poster.<отпечаток>.<расш>`.
 *
 * Отпечаток — начало sha256 содержимого: новый файл = новый адрес, поэтому
 * браузеры и сайт кешируют файл навсегда, а замена видна сразу. Имя
 * проверяется по шаблону и при записи, и при выдаче — `../` и чужие
 * файлы каталога наружу не уходят.
 */

export const MEDIA_HASH_LENGTH = 12;

const POSTER_MARK = '.poster';

export const SITE_MEDIA_FILE_NAME_PATTERN = new RegExp(
    `^(${SITE_MEDIA_KEY_SOURCE})(\\${POSTER_MARK})?\\.([0-9a-f]{${MEDIA_HASH_LENGTH}})\\.(${SITE_MEDIA_EXTENSIONS.join('|')})$`,
);

export interface ParsedMediaFileName {
    slot: string;
    role: SiteMediaRole;
    hash: string;
    extension: SiteMediaExtension;
}

export const mediaContentHash = (content: Buffer): string =>
    createHash('sha256')
        .update(content)
        .digest('hex')
        .slice(0, MEDIA_HASH_LENGTH);

export const buildMediaFileName = (
    slot: string,
    role: SiteMediaRole,
    hash: string,
    extension: SiteMediaExtension,
): string =>
    `${slot}${role === 'poster' ? POSTER_MARK : ''}.${hash}.${extension}`;

/** Разбор имени; null — не файл медиа (временный, чужой, с опасными символами). */
export function parseMediaFileName(name: string): ParsedMediaFileName | null {
    const match = SITE_MEDIA_FILE_NAME_PATTERN.exec(name);
    if (!match) return null;
    const [, slot, poster, hash, extension] = match;
    return {
        slot,
        role: poster ? 'poster' : 'main',
        hash,
        extension: extension as SiteMediaExtension,
    };
}
