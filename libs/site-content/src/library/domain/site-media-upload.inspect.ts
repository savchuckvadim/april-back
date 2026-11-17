import {
    SITE_MEDIA_FORMATS,
    sniffMediaFormat,
} from '../../media/domain/media-format';
import type { SiteMediaFileKind } from './site-media-library.const';
import type { SiteMediaLibraryUpload } from './site-media-library.types';

/** Что за файл пришёл: вид и тип по первым байтам — как у кадров /platform. */
export interface SiteMediaUploadInfo {
    kind: SiteMediaFileKind;
    mime: string;
    sizeBytes: number;
}

/**
 * Вид и тип файла по сигнатуре; null — не картинка и не ролик, которые
 * показывает сайт. Потолки размера и запись проверяет SiteMediaService.
 */
export function inspectUpload(
    upload: SiteMediaLibraryUpload,
): SiteMediaUploadInfo | null {
    const extension = sniffMediaFormat(upload.buffer);
    if (!extension) return null;
    const { kind, mime } = SITE_MEDIA_FORMATS[extension];
    return { kind, mime, sizeBytes: upload.buffer.length };
}
