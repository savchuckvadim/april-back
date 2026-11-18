import type {
    SiteMediaEmbedProvider,
    SiteMediaLibraryKind,
} from './site-media-library.const';

/** Строка медиатеки (site_media) в терминах домена. */
export interface SiteMediaRecord {
    id: string;
    kind: SiteMediaLibraryKind;
    /** Служебное название в медиатеке; клиент его не видит. */
    title: string | null;
    /** Подпись по умолчанию; статья может поставить свою. */
    caption: string | null;
    alt: string | null;
    /** Имя файла в storage/public/site-media/library; у embed — null. */
    fileName: string | null;
    /** Тёмный вариант картинки; null — один файл на обе темы. */
    darkFileName: string | null;
    /** Постер ролика. */
    posterFileName: string | null;
    mime: string | null;
    sizeBytes: number | null;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    embedProvider: SiteMediaEmbedProvider | null;
    embedUrl: string | null;
    embedId: string | null;
    uploadedBy: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    /** В скольких местах статей стоит медиа (связи site_article_media). */
    usageCount: number;
}

/** Новая строка: всё, кроме времени и счётчика использований. */
export type SiteMediaCreateInput = Omit<
    SiteMediaRecord,
    'createdAt' | 'updatedAt' | 'usageCount'
>;

/** Правка строки: вид, id и автор загрузки не меняются. */
export type SiteMediaPatch = Partial<
    Omit<SiteMediaCreateInput, 'id' | 'kind' | 'uploadedBy'>
>;

export interface SiteMediaListFilter {
    kind?: SiteMediaLibraryKind;
    /** true — только медиа, которое не стоит ни в одной статье. */
    unused?: boolean;
    /** Поиск по названию, подписи и alt. */
    search?: string;
    /** Номер страницы с 1. */
    page: number;
    pageSize: number;
}

export interface SiteMediaListPage {
    items: SiteMediaRecord[];
    total: number;
    page: number;
    pageSize: number;
}

/** Где стоит медиа: статья и место в ней. */
export interface SiteMediaUsage {
    articleId: string;
    section: string;
    slug: string;
    /** Заголовок опубликованной версии, иначе последней; null — текста в базе нет. */
    title: string | null;
    role: string;
    slot: string | null;
}

/** Внешнее видео, разобранное из ссылки. */
export interface SiteMediaEmbedRef {
    provider: SiteMediaEmbedProvider;
    id: string;
}

/** Загруженный файл: содержимое целиком (multer держит его в памяти). */
export interface SiteMediaLibraryUpload {
    buffer: Buffer;
}

/** Размеры ролика: их читает браузер админки из <video>, сервер проверяет диапазоны. */
export interface SiteMediaVideoMeta {
    width?: number;
    height?: number;
    durationSec?: number;
}

/** Подписи медиа: что админка задаёт при загрузке и правке. */
export interface SiteMediaTexts {
    title?: string | null;
    caption?: string | null;
    alt?: string | null;
}
