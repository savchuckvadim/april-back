import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { Prisma } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import { withSiteContentTables } from '../shared/site-content-prisma.errors';
import { SITE_MEDIA_LIBRARY_MESSAGES } from './domain/site-media-library.messages';
import type {
    SiteMediaCreateInput,
    SiteMediaListFilter,
    SiteMediaListPage,
    SiteMediaPatch,
    SiteMediaRecord,
    SiteMediaUsage,
} from './domain/site-media-library.types';
import { toSiteMediaRecord } from './site-media-library.mapper';
import { SiteMediaLibraryRepository } from './site-media-library.repository';

/** Счётчик связей со статьями — для пометки «не используется» в медиатеке. */
const WITH_USAGE_COUNT = {
    _count: { select: { usages: true } },
} as const satisfies Prisma.SiteMediaInclude;

const notFound = (): Error =>
    new NotFoundException(SITE_MEDIA_LIBRARY_MESSAGES.notFound);

/**
 * Медиатека на Prisma (site_media). Время created_at/updated_at ставится
 * здесь: расширение laravel-timestamps узнаёт колонки только по имени поля
 * snake_case, а у этих моделей поля camelCase.
 */
@Injectable()
export class SiteMediaLibraryPrismaRepository extends SiteMediaLibraryRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async create(input: SiteMediaCreateInput): Promise<SiteMediaRecord> {
        const now = new Date();
        const row = await withSiteContentTables(() =>
            this.prisma.siteMedia.create({
                data: { ...input, createdAt: now, updatedAt: now },
            }),
        );
        return toSiteMediaRecord(row);
    }

    async update(id: string, patch: SiteMediaPatch): Promise<SiteMediaRecord> {
        const row = await withSiteContentTables(
            () =>
                this.prisma.siteMedia.update({
                    where: { id },
                    data: { ...patch, updatedAt: new Date() },
                    include: WITH_USAGE_COUNT,
                }),
            { recordMissing: notFound },
        );
        return toSiteMediaRecord(row);
    }

    async findById(id: string): Promise<SiteMediaRecord | null> {
        const row = await withSiteContentTables(() =>
            this.prisma.siteMedia.findUnique({
                where: { id },
                include: WITH_USAGE_COUNT,
            }),
        );
        return row ? toSiteMediaRecord(row) : null;
    }

    async list(filter: SiteMediaListFilter): Promise<SiteMediaListPage> {
        const where = buildListWhere(filter);
        const [total, rows] = await withSiteContentTables(() =>
            Promise.all([
                this.prisma.siteMedia.count({ where }),
                this.prisma.siteMedia.findMany({
                    where,
                    include: WITH_USAGE_COUNT,
                    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                    skip: (filter.page - 1) * filter.pageSize,
                    take: filter.pageSize,
                }),
            ]),
        );
        return {
            items: rows.map(toSiteMediaRecord),
            total,
            page: filter.page,
            pageSize: filter.pageSize,
        };
    }

    async usage(id: string): Promise<SiteMediaUsage[]> {
        const links = await withSiteContentTables(() =>
            this.prisma.siteArticleMedia.findMany({
                where: { mediaId: id },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                select: {
                    role: true,
                    slot: true,
                    article: {
                        select: {
                            id: true,
                            section: true,
                            slug: true,
                            publishedRevision: { select: { title: true } },
                            revisions: {
                                orderBy: { number: 'desc' },
                                take: 1,
                                select: { title: true },
                            },
                        },
                    },
                },
            }),
        );
        return links.map(link => ({
            articleId: link.article.id,
            section: link.article.section,
            slug: link.article.slug,
            title:
                link.article.publishedRevision?.title ??
                link.article.revisions[0]?.title ??
                null,
            role: link.role,
            slot: link.slot,
        }));
    }

    async remove(id: string): Promise<void> {
        await withSiteContentTables(
            () => this.prisma.siteMedia.delete({ where: { id } }),
            {
                recordMissing: notFound,
                // Между проверкой и удалением медиа успели поставить в статью.
                foreignKey: () =>
                    new ConflictException(
                        SITE_MEDIA_LIBRARY_MESSAGES.inUseRace,
                    ),
            },
        );
    }
}

export function buildListWhere(
    filter: SiteMediaListFilter,
): Prisma.SiteMediaWhereInput {
    const search = filter.search?.trim();
    return {
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.unused ? { usages: { none: {} } } : {}),
        ...(search
            ? {
                  OR: [
                      { title: { contains: search } },
                      { caption: { contains: search } },
                      { alt: { contains: search } },
                  ],
              }
            : {}),
    };
}
