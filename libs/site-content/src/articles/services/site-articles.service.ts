import { randomUUID } from 'node:crypto';
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import {
    SITE_ARTICLE_DEFAULT_SORT,
    SITE_ARTICLE_SECTION_CONFIG,
    type SiteArticleSection,
    type SiteArticleType,
} from '../domain/site-article.const';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import { canDeleteForever } from '../domain/site-article-status';
import type {
    SiteArticleListFilter,
    SiteArticlePropsPatch,
    SiteArticleRecord,
} from '../domain/site-article.types';
import { SiteArticleRepository } from '../repositories/site-article.repository';
import { requireMeta, requireSlug } from './site-article-input';

export interface SiteArticleCreateCommand {
    section: SiteArticleSection;
    type: SiteArticleType;
    slug: string;
    sort?: number;
    meta?: unknown;
}

export interface SiteArticleEnsureCommand {
    section: SiteArticleSection;
    slug: string;
}

export interface SiteArticleUpdateCommand {
    sort?: number;
    type?: SiteArticleType;
    slug?: string;
    /** undefined — не менять, null — снять свойства. */
    meta?: unknown;
}

const badRequest = (message: string): never => {
    throw new BadRequestException(message);
};

/**
 * Статьи в админке: перечень, карточка, создание (открытые разделы),
 * «взять главу из кода» (ensure), свойства, удаление неопубликованной.
 * Текст — SiteArticleDraftsService, статус — SiteArticlePublishingService.
 */
@Injectable()
export class SiteArticlesService {
    constructor(private readonly articles: SiteArticleRepository) {}

    list(filter: SiteArticleListFilter): Promise<SiteArticleRecord[]> {
        return this.articles.list(filter);
    }

    async get(id: string): Promise<SiteArticleRecord> {
        const article = await this.articles.findById(id);
        if (!article)
            throw new NotFoundException(SITE_ARTICLE_MESSAGES.notFound);
        return article;
    }

    /** Статья без кода — только в открытом разделе и не «глава». */
    async create(
        command: SiteArticleCreateCommand,
        by: string | null,
    ): Promise<SiteArticleRecord> {
        if (!SITE_ARTICLE_SECTION_CONFIG[command.section].openList) {
            badRequest(SITE_ARTICLE_MESSAGES.createNotOpen);
        }
        if (command.type === 'chapter') {
            badRequest(SITE_ARTICLE_MESSAGES.createChapter);
        }
        return this.articles.create({
            id: randomUUID(),
            section: command.section,
            type: command.type,
            slug: requireSlug(command.slug),
            sort: command.sort ?? SITE_ARTICLE_DEFAULT_SORT,
            meta: requireMeta(command.meta),
            createdBy: by,
        });
    }

    /**
     * Строка для главы из кода: есть — возвращается как есть, нет —
     * заводится черновиком без версий (сайт по-прежнему показывает код).
     * Два одновременных вызова не создадут две строки: второй получит
     * «адрес занят» и прочитает строку первого.
     */
    async ensure(
        command: SiteArticleEnsureCommand,
        by: string | null,
    ): Promise<{ article: SiteArticleRecord; created: boolean }> {
        if (!SITE_ARTICLE_SECTION_CONFIG[command.section].codeChapters) {
            badRequest(SITE_ARTICLE_MESSAGES.ensureNotCode);
        }
        const slug = requireSlug(command.slug);
        const existing = await this.articles.findBySlug(command.section, slug);
        if (existing) return { article: existing, created: false };
        try {
            const article = await this.articles.create({
                id: randomUUID(),
                section: command.section,
                type: 'chapter',
                slug,
                sort: SITE_ARTICLE_DEFAULT_SORT,
                meta: null,
                createdBy: by,
            });
            return { article, created: true };
        } catch (error) {
            if (!(error instanceof ConflictException)) throw error;
            const raced = await this.articles.findBySlug(command.section, slug);
            if (!raced) throw error;
            return { article: raced, created: false };
        }
    }

    /** Адрес и тип — только до первой публикации; «глава» не меняет тип. */
    async update(
        id: string,
        command: SiteArticleUpdateCommand,
        by: string | null,
    ): Promise<SiteArticleRecord> {
        const current = await this.get(id);
        const slug =
            command.slug === undefined ? undefined : requireSlug(command.slug);
        const typeChanged =
            command.type !== undefined && command.type !== current.type;
        const slugChanged = slug !== undefined && slug !== current.slug;
        if (
            typeChanged &&
            (current.type === 'chapter' || command.type === 'chapter')
        ) {
            badRequest(SITE_ARTICLE_MESSAGES.chapterTypeFixed);
        }
        if ((typeChanged || slugChanged) && current.publishedRevisionId) {
            badRequest(SITE_ARTICLE_MESSAGES.addressAfterPublish);
        }
        const patch: SiteArticlePropsPatch = {
            sort: command.sort,
            type: typeChanged ? command.type : undefined,
            slug: slugChanged ? slug : undefined,
            meta:
                command.meta === undefined
                    ? undefined
                    : requireMeta(command.meta),
        };
        return this.articles.updateProps(id, patch, by);
    }

    /** Навсегда — только ни разу не публиковавшуюся; остальные — в архив. */
    async remove(id: string): Promise<void> {
        const article = await this.get(id);
        if (!canDeleteForever(article.publishedRevisionId !== null)) {
            badRequest(SITE_ARTICLE_MESSAGES.deletePublished);
        }
        await this.articles.remove(id);
    }
}
