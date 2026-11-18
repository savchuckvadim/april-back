import { randomUUID } from 'node:crypto';
import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { Prisma } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import { withSiteContentTables } from '../../shared/site-content-prisma.errors';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import type {
    SiteArticleRevisionInput,
    SiteArticleRevisionRecord,
    SiteArticleRevisionSummary,
} from '../domain/site-article.types';
import { toRevisionRecord, toRevisionSummary } from './site-article.mapper';
import { SiteArticleRevisionRepository } from './site-article-revision.repository';

const conflict = (): Error =>
    new ConflictException(SITE_ARTICLE_MESSAGES.versionConflict);
const notFound = (): Error =>
    new NotFoundException(SITE_ARTICLE_MESSAGES.notFound);

const SUMMARY_SELECT = {
    id: true,
    articleId: true,
    number: true,
    source: true,
    contentFormat: true,
    title: true,
    baseCodeHash: true,
    comment: true,
    createdBy: true,
    createdAt: true,
} as const satisfies Prisma.SiteArticleRevisionSelect;

/**
 * Версии статьи на Prisma. Новая версия — в транзакции: прочитать
 * последний номер, сверить с ожидаемым, вставить следующий и отметить
 * правку в статье. Гонку двух сохранений ловит уникальный ключ
 * (article_id, number): P2002 → 409, как и расхождение номера.
 */
@Injectable()
export class SiteArticleRevisionPrismaRepository extends SiteArticleRevisionRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async append(
        articleId: string,
        expectedNumber: number,
        input: SiteArticleRevisionInput,
    ): Promise<SiteArticleRevisionRecord> {
        const row = await withSiteContentTables(
            () =>
                this.prisma.$transaction(async tx => {
                    const last = await tx.siteArticleRevision.findFirst({
                        where: { articleId },
                        orderBy: { number: 'desc' },
                        select: { number: true },
                    });
                    const current = last?.number ?? 0;
                    if (current !== expectedNumber) throw conflict();
                    const now = new Date();
                    const created = await tx.siteArticleRevision.create({
                        data: {
                            ...input,
                            id: randomUUID(),
                            articleId,
                            number: current + 1,
                            blocks: input.blocks,
                            createdAt: now,
                        },
                    });
                    await tx.siteArticle.update({
                        where: { id: articleId },
                        data: { updatedBy: input.createdBy, updatedAt: now },
                    });
                    return created;
                }),
            {
                unique: conflict,
                foreignKey: notFound,
                recordMissing: notFound,
            },
        );
        return toRevisionRecord(row);
    }

    async list(articleId: string): Promise<SiteArticleRevisionSummary[]> {
        const rows = await withSiteContentTables(() =>
            this.prisma.siteArticleRevision.findMany({
                where: { articleId },
                orderBy: { number: 'desc' },
                select: SUMMARY_SELECT,
            }),
        );
        return rows.map(toRevisionSummary);
    }

    async get(
        articleId: string,
        revisionId: string,
    ): Promise<SiteArticleRevisionRecord | null> {
        const row = await withSiteContentTables(() =>
            this.prisma.siteArticleRevision.findFirst({
                where: { id: revisionId, articleId },
            }),
        );
        return row ? toRevisionRecord(row) : null;
    }

    async latest(articleId: string): Promise<SiteArticleRevisionRecord | null> {
        const row = await withSiteContentTables(() =>
            this.prisma.siteArticleRevision.findFirst({
                where: { articleId },
                orderBy: { number: 'desc' },
            }),
        );
        return row ? toRevisionRecord(row) : null;
    }
}
