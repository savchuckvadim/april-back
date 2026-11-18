import type {
    SiteArticleMediaLink,
    SiteArticleMediaLinkInput,
} from '../domain/site-article.types';

/**
 * Где в статье стоит медиа (site_article_media). Связи не версионируются:
 * замена кадра видна на сайте без публикации текста.
 */
export abstract class SiteArticleMediaLinkRepository {
    /** Все связи статьи с медиа: обложка, места, галерея по порядку. */
    abstract listByArticle(articleId: string): Promise<SiteArticleMediaLink[]>;
    /** Обложки нескольких статей — для перечня раздела. */
    abstract coversOf(articleIds: string[]): Promise<SiteArticleMediaLink[]>;
    /** Обложка или место в тексте: одно медиа на место, повторная привязка заменяет. */
    abstract putSlot(
        input: SiteArticleMediaLinkInput,
    ): Promise<SiteArticleMediaLink>;
    /** Галерея: медиа добавляется в конец; уже стоящее — обновляет подпись и порядок. */
    abstract putGallery(
        input: SiteArticleMediaLinkInput,
    ): Promise<SiteArticleMediaLink>;
    abstract remove(articleId: string, linkId: string): Promise<void>;
    /** Порядок галереи: ровно все её связи в новом порядке, иначе 409. */
    abstract reorderGallery(
        articleId: string,
        linkIds: string[],
    ): Promise<SiteArticleMediaLink[]>;
}
