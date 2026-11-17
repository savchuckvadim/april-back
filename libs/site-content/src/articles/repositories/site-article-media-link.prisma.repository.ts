import { randomUUID } from 'node:crypto';
import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { Prisma } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import { withSiteContentTables } from '../../shared/site-content-prisma.errors';
import { SITE_ARTICLE_DEFAULT_SORT } from '../domain/site-article.const';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import type {
    SiteArticleMediaLink,
    SiteArticleMediaLinkInput,
} from '../domain/site-article.types';
import { toMediaLinks, type SiteArticleMediaRow } from './site-article.mapper';
import { SiteArticleMediaLinkRepository } from './site-article-media-link.repository';

const WITH_MEDIA = {
    media: { include: { _count: { select: { usages: true } } } },
} as const satisfies Prisma.SiteArticleMediaInclude;

const LINK_ORDER = [
    { role: 'asc' },
    { sort: 'asc' },
    { createdAt: 'asc' },
    { id: 'asc' },
] as const satisfies readonly Prisma.SiteArticleMediaOrderByWithRelationInput[];

/** Шаг порядка галереи: между соседями остаётся место. */
const GALLERY_STEP = 10;

const ERRORS = {
    unique: () => new ConflictException(SITE_ARTICLE_MESSAGES.slotTaken),
    // Статью или медиа удалили между проверкой и записью.
    foreignKey: () =>
        new NotFoundException(SITE_ARTICLE_MESSAGES.mediaNotFound),
    recordMissing: () =>
        new NotFoundException(SITE_ARTICLE_MESSAGES.linkNotFound),
};

/**
 * Связи статья ↔ медиа на Prisma. Составной уникальный ключ с NULL в slot
 * Prisma читает только через findFirst/findMany (findUnique с null не
 * работает), поэтому поиск существующей связи — findFirst.
 */
@Injectable()
export class SiteArticleMediaLinkPrismaRepository extends SiteArticleMediaLinkRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    listByArticle(articleId: string): Promise<SiteArticleMediaLink[]> {
        return this.find({ articleId });
    }

    coversOf(articleIds: string[]): Promise<SiteArticleMediaLink[]> {
        if (articleIds.length === 0) return Promise.resolve([]);
        return this.find({ articleId: { in: articleIds }, role: 'cover' });
    }

    putSlot(input: SiteArticleMediaLinkInput): Promise<SiteArticleMediaLink> {
        return this.upsert(input, {
            articleId: input.articleId,
            role: input.role,
            slot: input.slot,
        });
    }

    putGallery(
        input: SiteArticleMediaLinkInput,
    ): Promise<SiteArticleMediaLink> {
        return this.upsert(input, {
            articleId: input.articleId,
            role: 'gallery',
            mediaId: input.mediaId,
        });
    }

    async remove(articleId: string, linkId: string): Promise<void> {
        const { count } = await withSiteContentTables(() =>
            this.prisma.siteArticleMedia.deleteMany({
                where: { id: linkId, articleId },
            }),
        );
        if (count === 0) throw ERRORS.recordMissing();
    }

    async reorderGallery(
        articleId: string,
        linkIds: string[],
    ): Promise<SiteArticleMediaLink[]> {
        await withSiteContentTables(
            () =>
                this.prisma.$transaction(async tx => {
                    const current = await tx.siteArticleMedia.findMany({
                        where: { articleId, role: 'gallery' },
                        select: { id: true },
                    });
                    const known = new Set(current.map(link => link.id));
                    const same =
                        new Set(linkIds).size === linkIds.length &&
                        linkIds.length === known.size &&
                        linkIds.every(id => known.has(id));
                    if (!same) {
                        throw new ConflictException(
                            SITE_ARTICLE_MESSAGES.galleryChanged,
                        );
                    }
                    const now = new Date();
                    for (const [index, id] of linkIds.entries()) {
                        await tx.siteArticleMedia.update({
                            where: { id },
                            data: {
                                sort: (index + 1) * GALLERY_STEP,
                                updatedAt: now,
                            },
                        });
                    }
                }),
            ERRORS,
        );
        return this.find({ articleId, role: 'gallery' });
    }

    private async find(
        where: Prisma.SiteArticleMediaWhereInput,
    ): Promise<SiteArticleMediaLink[]> {
        const rows: SiteArticleMediaRow[] = await withSiteContentTables(() =>
            this.prisma.siteArticleMedia.findMany({
                where,
                include: WITH_MEDIA,
                orderBy: [...LINK_ORDER],
            }),
        );
        return toMediaLinks(rows);
    }

    /** Есть связь по ключу — правка медиа, подписи и порядка; нет — новая. */
    private async upsert(
        input: SiteArticleMediaLinkInput,
        key: Prisma.SiteArticleMediaWhereInput,
    ): Promise<SiteArticleMediaLink> {
        const row = await withSiteContentTables(async () => {
            const now = new Date();
            const existing = await this.prisma.siteArticleMedia.findFirst({
                where: key,
            });
            if (existing) {
                return this.prisma.siteArticleMedia.update({
                    where: { id: existing.id },
                    data: {
                        mediaId: input.mediaId,
                        caption: input.caption,
                        sort: input.sort ?? existing.sort,
                        updatedAt: now,
                    },
                    include: WITH_MEDIA,
                });
            }
            return this.prisma.siteArticleMedia.create({
                data: {
                    ...input,
                    id: randomUUID(),
                    sort: input.sort ?? (await this.nextSort(input)),
                    createdAt: now,
                    updatedAt: now,
                },
                include: WITH_MEDIA,
            });
        }, ERRORS);
        const [link] = toMediaLinks([row]);
        return link;
    }

    /** Новое в галерее — в конец; обложка и места — порядок по умолчанию. */
    private async nextSort(input: SiteArticleMediaLinkInput): Promise<number> {
        if (input.role !== 'gallery') return SITE_ARTICLE_DEFAULT_SORT;
        const last = await this.prisma.siteArticleMedia.aggregate({
            where: { articleId: input.articleId, role: 'gallery' },
            _max: { sort: true },
        });
        return (last._max.sort ?? 0) + GALLERY_STEP;
    }
}
