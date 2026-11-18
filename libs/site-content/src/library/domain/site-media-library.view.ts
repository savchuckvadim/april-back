import { SITE_MEDIA_LIBRARY_PUBLIC_PATH } from './site-media-library.const';
import type {
    SiteMediaEmbedRef,
    SiteMediaRecord,
} from './site-media-library.types';

/** Адрес файла медиатеки на сайте: /media/library/<имя>. */
export const siteMediaFileUrl = (name: string | null): string | null =>
    name ? `${SITE_MEDIA_LIBRARY_PUBLIC_PATH}/${name}` : null;

/** Медиа для админки: строка целиком плюс адреса файлов на сайте. */
export interface SiteMediaView extends SiteMediaRecord {
    url: string | null;
    darkUrl: string | null;
    posterUrl: string | null;
}

export const toSiteMediaView = (record: SiteMediaRecord): SiteMediaView => ({
    ...record,
    url: siteMediaFileUrl(record.fileName),
    darkUrl: siteMediaFileUrl(record.darkFileName),
    posterUrl: siteMediaFileUrl(record.posterFileName),
});

/**
 * Медиа для сайта: без служебного названия, автора и исходной ссылки на
 * внешнее видео — только то, что нужно для отрисовки. Внешнее видео —
 * поставщиком и id: адрес плеера сайт собирает сам.
 */
export interface SiteMediaPublicView {
    id: string;
    kind: SiteMediaRecord['kind'];
    /** Подпись в этой статье или подпись медиа по умолчанию. */
    caption: string | null;
    alt: string | null;
    url: string | null;
    darkUrl: string | null;
    posterUrl: string | null;
    mime: string | null;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    embed: SiteMediaEmbedRef | null;
}

export const toSiteMediaPublicView = (
    record: SiteMediaRecord,
    captionInArticle: string | null = null,
): SiteMediaPublicView => ({
    id: record.id,
    kind: record.kind,
    caption: captionInArticle ?? record.caption,
    alt: record.alt,
    url: siteMediaFileUrl(record.fileName),
    darkUrl: siteMediaFileUrl(record.darkFileName),
    posterUrl: siteMediaFileUrl(record.posterFileName),
    mime: record.mime,
    width: record.width,
    height: record.height,
    durationSec: record.durationSec,
    embed:
        record.embedProvider && record.embedId
            ? { provider: record.embedProvider, id: record.embedId }
            : null,
});
