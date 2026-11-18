import type {
    SiteArticleRevisionInput,
    SiteArticleRevisionRecord,
    SiteArticleRevisionSummary,
} from '../domain/site-article.types';

/**
 * Версии текста статьи (site_article_revisions). Версия неизменна; номер
 * растёт внутри статьи (unique article_id + number).
 */
export abstract class SiteArticleRevisionRepository {
    /**
     * Новая версия номером «последний + 1» — только если последний номер
     * равен ожидаемому (0 — версий ещё нет). Расхождение или вставка того
     * же номера параллельно — 409.
     */
    abstract append(
        articleId: string,
        expectedNumber: number,
        input: SiteArticleRevisionInput,
    ): Promise<SiteArticleRevisionRecord>;
    /** История, новые первыми, без текста. */
    abstract list(articleId: string): Promise<SiteArticleRevisionSummary[]>;
    abstract get(
        articleId: string,
        revisionId: string,
    ): Promise<SiteArticleRevisionRecord | null>;
    abstract latest(
        articleId: string,
    ): Promise<SiteArticleRevisionRecord | null>;
}
