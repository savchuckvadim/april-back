import type {
    SiteMediaCreateInput,
    SiteMediaListFilter,
    SiteMediaListPage,
    SiteMediaPatch,
    SiteMediaRecord,
    SiteMediaUsage,
} from './domain/site-media-library.types';

/**
 * Хранилище строк медиатеки (site_media). Реализация — Prisma
 * (SiteMediaLibraryPrismaRepository), в тестах — память.
 *
 * Ошибки: таблицы нет — SiteContentTablesMissingException (503 админке);
 * строки нет при правке — 404; медиа стоит в статье при удалении — 409.
 */
export abstract class SiteMediaLibraryRepository {
    abstract create(input: SiteMediaCreateInput): Promise<SiteMediaRecord>;
    abstract update(
        id: string,
        patch: SiteMediaPatch,
    ): Promise<SiteMediaRecord>;
    abstract findById(id: string): Promise<SiteMediaRecord | null>;
    abstract list(filter: SiteMediaListFilter): Promise<SiteMediaListPage>;
    /** Где стоит медиа: статьи и места в них. */
    abstract usage(id: string): Promise<SiteMediaUsage[]>;
    abstract remove(id: string): Promise<void>;
}
