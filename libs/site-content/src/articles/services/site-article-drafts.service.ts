import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { cleanTextOrNull } from '../../shared/clean-text';
import {
    SITE_ARTICLE_SECTION_CONFIG,
    type SiteArticleContentFormat,
    type SiteArticleDraftSource,
} from '../domain/site-article.const';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import {
    revisionContentOf,
    type SiteArticleRecord,
    type SiteArticleRevisionRecord,
    type SiteArticleRevisionSummary,
} from '../domain/site-article.types';
import { SiteArticleRevisionRepository } from '../repositories/site-article-revision.repository';
import { requireBlocks } from './site-article-input';
import { SiteArticlesService } from './site-articles.service';

/** Черновик из админки: текст целиком и номер версии, на которой сделана правка. */
export interface SiteArticleDraftCommand {
    /** Номер последней версии, которую видел правщик; 0 — версий ещё нет. */
    expectedNumber: number;
    source?: SiteArticleDraftSource;
    contentFormat?: SiteArticleContentFormat;
    eyebrow?: string | null;
    title: string;
    description?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    blocks: unknown;
    baseCodeHash?: string | null;
    comment?: string | null;
}

export interface SiteArticleSaved {
    revision: SiteArticleRevisionRecord;
    article: SiteArticleRecord;
}

/**
 * Текст статьи: сохранить черновик (новая неизменная версия), история,
 * версия целиком, «вернуть прежнюю» — копией с source = restore.
 * Защита от одновременной правки — ожидаемый номер версии (409).
 */
@Injectable()
export class SiteArticleDraftsService {
    constructor(
        private readonly articles: SiteArticlesService,
        private readonly revisions: SiteArticleRevisionRepository,
    ) {}

    async save(
        articleId: string,
        command: SiteArticleDraftCommand,
        by: string | null,
    ): Promise<SiteArticleSaved> {
        const article = await this.editable(articleId);
        const format = SITE_ARTICLE_SECTION_CONFIG[article.section].format;
        if (command.contentFormat && command.contentFormat !== format) {
            throw new BadRequestException(SITE_ARTICLE_MESSAGES.formatMismatch);
        }
        const title = command.title.trim();
        if (!title)
            throw new BadRequestException(SITE_ARTICLE_MESSAGES.titleRequired);
        const revision = await this.revisions.append(
            articleId,
            command.expectedNumber,
            {
                source: command.source ?? 'admin',
                contentFormat: format,
                eyebrow: cleanTextOrNull(command.eyebrow),
                title,
                description: cleanTextOrNull(command.description),
                seoTitle: cleanTextOrNull(command.seoTitle),
                seoDescription: cleanTextOrNull(command.seoDescription),
                blocks: requireBlocks(format, command.blocks),
                baseCodeHash: cleanTextOrNull(command.baseCodeHash),
                comment: cleanTextOrNull(command.comment),
                createdBy: by,
            },
        );
        return { revision, article: await this.articles.get(articleId) };
    }

    /** Карточка для редактора: статья и последняя версия целиком (или null). */
    async card(articleId: string): Promise<{
        article: SiteArticleRecord;
        latest: SiteArticleRevisionRecord | null;
    }> {
        const article = await this.articles.get(articleId);
        return { article, latest: await this.revisions.latest(articleId) };
    }

    async list(articleId: string): Promise<SiteArticleRevisionSummary[]> {
        await this.articles.get(articleId);
        return this.revisions.list(articleId);
    }

    async get(
        articleId: string,
        revisionId: string,
    ): Promise<SiteArticleRevisionRecord> {
        await this.articles.get(articleId);
        return this.require(articleId, revisionId);
    }

    /** Прежняя версия — новой версией поверх последней; публикуется отдельно. */
    async restore(
        articleId: string,
        revisionId: string,
        expectedNumber: number,
        comment: string | null | undefined,
        by: string | null,
    ): Promise<SiteArticleSaved> {
        await this.editable(articleId);
        const original = await this.require(articleId, revisionId);
        const revision = await this.revisions.append(
            articleId,
            expectedNumber,
            {
                ...revisionContentOf(original),
                source: 'restore',
                baseCodeHash: original.baseCodeHash,
                comment:
                    cleanTextOrNull(comment) ??
                    `Копия версии ${original.number}`,
                createdBy: by,
            },
        );
        return { revision, article: await this.articles.get(articleId) };
    }

    private async editable(articleId: string): Promise<SiteArticleRecord> {
        const article = await this.articles.get(articleId);
        if (article.status === 'archived') {
            throw new BadRequestException(SITE_ARTICLE_MESSAGES.draftArchived);
        }
        return article;
    }

    private async require(
        articleId: string,
        revisionId: string,
    ): Promise<SiteArticleRevisionRecord> {
        const revision = await this.revisions.get(articleId, revisionId);
        if (!revision) {
            throw new NotFoundException(SITE_ARTICLE_MESSAGES.revisionNotFound);
        }
        return revision;
    }
}
