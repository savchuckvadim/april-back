import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SiteContentTablesMissingException } from '../../shared/site-content-prisma.errors';
import {
    SITE_ARTICLE_SECTION_CONFIG,
    type SiteArticleSection,
} from '../domain/site-article.const';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import { normalizeArticleSlug } from '../domain/site-article-props';
import {
    buildArticleMedia,
    emptyArticleMedia,
    publicArticleView,
    toPublicListItem,
    type SiteArticlePublicListItem,
    type SiteArticlePublicView,
} from '../domain/site-article-public.view';
import {
    revisionContentOf,
    type SiteArticleRecord,
    type SiteArticleRevisionContent,
} from '../domain/site-article.types';
import { SiteArticleMediaLinkRepository } from '../repositories/site-article-media-link.repository';
import { SiteArticleRepository } from '../repositories/site-article.repository';
import { SiteArticleRevisionRepository } from '../repositories/site-article-revision.repository';

const notFound = (): NotFoundException =>
    new NotFoundException(SITE_ARTICLE_MESSAGES.publicNotFound);

/**
 * Чтение статей сайтом (apps/bot): только опубликованное.
 *
 * - Опубликованная статья — текст опубликованной версии и медиа по местам.
 * - Глава из кода без публикации (или строки нет вовсе в разделе с главами
 *   в коде) — `content: null` и медиа мест: сайт показывает текст из кода
 *   и подставляет кадры.
 * - Статья без кода и без публикации — 404.
 * - Таблиц ещё нет (миграция не применена) — как «статьи нет»: сайт
 *   работает на тексте из кода, без ошибок.
 */
@Injectable()
export class SiteArticlesReaderService {
    private readonly logger = new Logger(SiteArticlesReaderService.name);

    constructor(
        private readonly articles: SiteArticleRepository,
        private readonly revisions: SiteArticleRevisionRepository,
        private readonly links: SiteArticleMediaLinkRepository,
    ) {}

    async listSection(
        section: SiteArticleSection,
    ): Promise<SiteArticlePublicListItem[]> {
        return this.tolerant([], async () => {
            const published = await this.articles.listPublished(section);
            const covers = await this.links.coversOf(
                published.map(item => item.article.id),
            );
            return published.map(item =>
                toPublicListItem(
                    item,
                    covers.find(cover => cover.articleId === item.article.id),
                ),
            );
        });
    }

    async article(
        section: SiteArticleSection,
        rawSlug: string,
    ): Promise<SiteArticlePublicView> {
        const slug = normalizeArticleSlug(rawSlug);
        if (!slug) throw notFound();
        const codeChapters = SITE_ARTICLE_SECTION_CONFIG[section].codeChapters;
        const view = await this.tolerant(null, () => this.read(section, slug));
        if (view) return view;
        if (!codeChapters) throw notFound();
        return publicArticleView(
            { section, slug, type: 'chapter', meta: null, publishedAt: null },
            null,
            emptyArticleMedia(),
        );
    }

    /** null — строки нет; 404 — статья без кода и без публикации. */
    private async read(
        section: SiteArticleSection,
        slug: string,
    ): Promise<SiteArticlePublicView | null> {
        const article = await this.articles.findBySlug(section, slug);
        if (!article) return null;
        const content = await this.publishedContent(article);
        if (!content && article.type !== 'chapter') throw notFound();
        const links = await this.links.listByArticle(article.id);
        return publicArticleView(article, content, buildArticleMedia(links));
    }

    private async publishedContent(
        article: SiteArticleRecord,
    ): Promise<SiteArticleRevisionContent | null> {
        if (article.status !== 'published' || !article.publishedRevisionId) {
            return null;
        }
        const revision = await this.revisions.get(
            article.id,
            article.publishedRevisionId,
        );
        return revision ? revisionContentOf(revision) : null;
    }

    /** Таблиц нет — ответ «пусто» вместо ошибки, с предупреждением в журнал. */
    private async tolerant<T>(fallback: T, work: () => Promise<T>): Promise<T> {
        try {
            return await work();
        } catch (error) {
            if (!(error instanceof SiteContentTablesMissingException))
                throw error;
            this.logger.warn(
                'Таблиц статей сайта ещё нет (миграция online не применена) — сайт показывает текст из кода',
            );
            return fallback;
        }
    }
}
