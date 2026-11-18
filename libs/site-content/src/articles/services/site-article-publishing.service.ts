import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import {
    canApply,
    SITE_ARTICLE_ALLOWED_FROM,
    statusAfter,
    statusRefusal,
    type SiteArticleStatusAction,
} from '../domain/site-article-status';
import type { SiteArticleRecord } from '../domain/site-article.types';
import { SiteArticleRepository } from '../repositories/site-article.repository';
import { SiteArticleRevisionRepository } from '../repositories/site-article-revision.repository';
import { SiteArticlesService } from './site-articles.service';

/**
 * Статус статьи на сайте: опубликовать версию, снять, в архив и из архива.
 * Переход проверяется дважды: здесь — понятный отказ по текущему статусу,
 * в хранилище — условие в самом запросе (статус успели сменить — 409).
 * Ручки — только суперпользователю (Roles на контроллере).
 */
@Injectable()
export class SiteArticlePublishingService {
    constructor(
        private readonly articles: SiteArticlesService,
        private readonly repository: SiteArticleRepository,
        private readonly revisions: SiteArticleRevisionRepository,
    ) {}

    /** Любая версия статьи становится действующей; более новые остаются черновиком. */
    async publish(
        articleId: string,
        revisionId: string,
        by: string | null,
    ): Promise<SiteArticleRecord> {
        await this.allowed(articleId, 'publish');
        if (!(await this.revisions.get(articleId, revisionId))) {
            throw new NotFoundException(SITE_ARTICLE_MESSAGES.revisionNotFound);
        }
        return this.repository.transition(articleId, {
            from: SITE_ARTICLE_ALLOWED_FROM.publish,
            status: 'published',
            by,
            publishRevisionId: revisionId,
        });
    }

    unpublish(
        articleId: string,
        by: string | null,
    ): Promise<SiteArticleRecord> {
        return this.apply(articleId, 'unpublish', by);
    }

    archive(articleId: string, by: string | null): Promise<SiteArticleRecord> {
        return this.apply(articleId, 'archive', by);
    }

    unarchive(
        articleId: string,
        by: string | null,
    ): Promise<SiteArticleRecord> {
        return this.apply(articleId, 'unarchive', by);
    }

    private async apply(
        articleId: string,
        action: Exclude<SiteArticleStatusAction, 'publish'>,
        by: string | null,
    ): Promise<SiteArticleRecord> {
        const article = await this.allowed(articleId, action);
        return this.repository.transition(articleId, {
            from: SITE_ARTICLE_ALLOWED_FROM[action],
            status: statusAfter(action, article.publishedRevisionId !== null),
            by,
        });
    }

    private async allowed(
        articleId: string,
        action: SiteArticleStatusAction,
    ): Promise<SiteArticleRecord> {
        const article = await this.articles.get(articleId);
        if (!canApply(action, article.status)) {
            throw new BadRequestException(statusRefusal(action));
        }
        return article;
    }
}
