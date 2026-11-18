import type { SiteArticleSection } from '../domain/site-article.const';
import type {
    SiteArticleCreateInput,
    SiteArticleListFilter,
    SiteArticlePropsPatch,
    SiteArticlePublishedSummary,
    SiteArticleRecord,
    SiteArticleTransition,
} from '../domain/site-article.types';

/**
 * Хранилище статей (site_articles). Реализация — Prisma, в тестах — память.
 *
 * Ошибки: таблицы нет — SiteContentTablesMissingException (503 админке,
 * публичное чтение ловит его сам); адрес занят — 409; статьи нет при
 * правке — 404; статус успели сменить — 409.
 */
export abstract class SiteArticleRepository {
    abstract list(filter: SiteArticleListFilter): Promise<SiteArticleRecord[]>;
    abstract findById(id: string): Promise<SiteArticleRecord | null>;
    abstract findBySlug(
        section: SiteArticleSection,
        slug: string,
    ): Promise<SiteArticleRecord | null>;
    abstract create(input: SiteArticleCreateInput): Promise<SiteArticleRecord>;
    abstract updateProps(
        id: string,
        patch: SiteArticlePropsPatch,
        by: string | null,
    ): Promise<SiteArticleRecord>;
    /** Смена статуса только из допустимых: условие — в самом запросе, гонки нет. */
    abstract transition(
        id: string,
        transition: SiteArticleTransition,
    ): Promise<SiteArticleRecord>;
    /** Удаление навсегда — только ни разу не публиковавшейся (условие в запросе). */
    abstract remove(id: string): Promise<void>;
    /** Опубликованные статьи раздела по порядку — для перечня на сайте. */
    abstract listPublished(
        section: SiteArticleSection,
    ): Promise<SiteArticlePublishedSummary[]>;
}
