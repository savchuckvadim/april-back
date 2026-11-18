import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import { withSiteContentTables } from '../../shared/site-content-prisma.errors';
import type { SiteArticleSection } from '../domain/site-article.const';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import type { SiteArticleMeta } from '../domain/site-article-props';
import type {
    SiteArticleCreateInput,
    SiteArticleListFilter,
    SiteArticlePropsPatch,
    SiteArticlePublishedSummary,
    SiteArticleRecord,
    SiteArticleTransition,
} from '../domain/site-article.types';
import {
    SITE_ARTICLE_STATE_INCLUDE,
    toArticleRecord,
    toArticleRecords,
} from './site-article.mapper';
import { SiteArticleRepository } from './site-article.repository';

const notFound = (): Error =>
    new NotFoundException(SITE_ARTICLE_MESSAGES.notFound);
const slugTaken = (): Error =>
    new ConflictException(SITE_ARTICLE_MESSAGES.slugTaken);

/** null в Json-колонке — это Prisma.DbNull, а не JS null. */
const metaValue = (
    meta: SiteArticleMeta | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull =>
    meta === null ? Prisma.DbNull : meta;

const PUBLISHED_INCLUDE = {
    ...SITE_ARTICLE_STATE_INCLUDE,
    publishedRevision: {
        select: { number: true, title: true, eyebrow: true, description: true },
    },
} as const satisfies Prisma.SiteArticleInclude;

/**
 * Статьи на Prisma (site_articles). created_at/updated_at ставятся здесь:
 * расширение laravel-timestamps узнаёт только поля snake_case.
 */
@Injectable()
export class SiteArticlePrismaRepository extends SiteArticleRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async list(filter: SiteArticleListFilter): Promise<SiteArticleRecord[]> {
        const rows = await withSiteContentTables(() =>
            this.prisma.siteArticle.findMany({
                where: filter,
                include: SITE_ARTICLE_STATE_INCLUDE,
                orderBy: [{ section: 'asc' }, { sort: 'asc' }, { slug: 'asc' }],
            }),
        );
        return toArticleRecords(rows);
    }

    async findById(id: string): Promise<SiteArticleRecord | null> {
        const row = await withSiteContentTables(() =>
            this.prisma.siteArticle.findUnique({
                where: { id },
                include: SITE_ARTICLE_STATE_INCLUDE,
            }),
        );
        return row ? toArticleRecord(row) : null;
    }

    async findBySlug(
        section: SiteArticleSection,
        slug: string,
    ): Promise<SiteArticleRecord | null> {
        const row = await withSiteContentTables(() =>
            this.prisma.siteArticle.findUnique({
                where: { section_slug: { section, slug } },
                include: SITE_ARTICLE_STATE_INCLUDE,
            }),
        );
        return row ? toArticleRecord(row) : null;
    }

    async create(input: SiteArticleCreateInput): Promise<SiteArticleRecord> {
        const now = new Date();
        const row = await withSiteContentTables(
            () =>
                this.prisma.siteArticle.create({
                    data: {
                        ...input,
                        meta: metaValue(input.meta),
                        status: 'draft',
                        updatedBy: input.createdBy,
                        createdAt: now,
                        updatedAt: now,
                    },
                    include: SITE_ARTICLE_STATE_INCLUDE,
                }),
            { unique: slugTaken },
        );
        return this.required(row);
    }

    async updateProps(
        id: string,
        patch: SiteArticlePropsPatch,
        by: string | null,
    ): Promise<SiteArticleRecord> {
        const { meta, ...rest } = patch;
        const row = await withSiteContentTables(
            () =>
                this.prisma.siteArticle.update({
                    where: { id },
                    data: {
                        ...rest,
                        ...(meta !== undefined
                            ? { meta: metaValue(meta) }
                            : {}),
                        updatedBy: by,
                        updatedAt: new Date(),
                    },
                    include: SITE_ARTICLE_STATE_INCLUDE,
                }),
            { unique: slugTaken, recordMissing: notFound },
        );
        return this.required(row);
    }

    async transition(
        id: string,
        transition: SiteArticleTransition,
    ): Promise<SiteArticleRecord> {
        const now = new Date();
        const { count } = await withSiteContentTables(
            () =>
                this.prisma.siteArticle.updateMany({
                    where: { id, status: { in: [...transition.from] } },
                    data: {
                        status: transition.status,
                        updatedBy: transition.by,
                        updatedAt: now,
                        ...(transition.publishRevisionId
                            ? {
                                  publishedRevisionId:
                                      transition.publishRevisionId,
                                  publishedAt: now,
                                  publishedBy: transition.by,
                              }
                            : {}),
                    },
                }),
            // Версию успели удалить вместе со статьёй.
            { foreignKey: notFound },
        );
        const article = await this.findById(id);
        if (!article) throw notFound();
        if (count === 0) {
            throw new ConflictException(SITE_ARTICLE_MESSAGES.stateChanged);
        }
        return article;
    }

    async remove(id: string): Promise<void> {
        const { count } = await withSiteContentTables(() =>
            this.prisma.siteArticle.deleteMany({
                where: { id, publishedRevisionId: null },
            }),
        );
        if (count > 0) return;
        if (!(await this.findById(id))) throw notFound();
        throw new BadRequestException(SITE_ARTICLE_MESSAGES.deletePublished);
    }

    async listPublished(
        section: SiteArticleSection,
    ): Promise<SiteArticlePublishedSummary[]> {
        const rows = await withSiteContentTables(() =>
            this.prisma.siteArticle.findMany({
                where: {
                    section,
                    status: 'published',
                    publishedRevisionId: { not: null },
                },
                include: PUBLISHED_INCLUDE,
                orderBy: [{ sort: 'asc' }, { publishedAt: 'desc' }],
            }),
        );
        return rows.flatMap(row => {
            const article = toArticleRecord(row);
            const revision = row.publishedRevision;
            return article && revision
                ? [
                      {
                          article,
                          revision: {
                              eyebrow: revision.eyebrow,
                              title: revision.title,
                              description: revision.description,
                          },
                      },
                  ]
                : [];
        });
    }

    private required(
        row: Parameters<typeof toArticleRecord>[0],
    ): SiteArticleRecord {
        const record = toArticleRecord(row);
        if (!record) throw notFound();
        return record;
    }
}
