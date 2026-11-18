import type { SiteMedia } from 'generated/prisma';
import { isOneOf, oneOfOrNull } from '../shared/one-of';
import {
    SITE_MEDIA_EMBED_PROVIDERS,
    SITE_MEDIA_LIBRARY_KINDS,
    type SiteMediaLibraryKind,
} from './domain/site-media-library.const';
import type { SiteMediaRecord } from './domain/site-media-library.types';

/** Строка Prisma с необязательным счётчиком связей со статьями. */
export type SiteMediaRow = SiteMedia & { _count?: { usages: number } };

/**
 * Вид из базы: неизвестное значение (строку правили руками) читается по
 * наличию файла — картинка с файлом, внешнее видео без него.
 */
const kindOf = (row: SiteMedia): SiteMediaLibraryKind =>
    isOneOf(SITE_MEDIA_LIBRARY_KINDS, row.kind)
        ? row.kind
        : row.fileName
          ? 'image'
          : 'embed';

/** Строка site_media → запись домена; используется и связями статей. */
export const toSiteMediaRecord = (row: SiteMediaRow): SiteMediaRecord => ({
    id: row.id,
    kind: kindOf(row),
    title: row.title,
    caption: row.caption,
    alt: row.alt,
    fileName: row.fileName,
    darkFileName: row.darkFileName,
    posterFileName: row.posterFileName,
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    durationSec: row.durationSec,
    embedProvider: oneOfOrNull(SITE_MEDIA_EMBED_PROVIDERS, row.embedProvider),
    embedUrl: row.embedUrl,
    embedId: row.embedId,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    usageCount: row._count?.usages ?? 0,
});
