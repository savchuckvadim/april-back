import type {
    Prisma,
    SiteArticle,
    SiteArticleMedia,
    SiteArticleRevision,
} from 'generated/prisma';
import {
    toSiteMediaRecord,
    type SiteMediaRow,
} from '../../library/site-media-library.mapper';
import { isOneOf, oneOfOrNull } from '../../shared/one-of';
import {
    SITE_ARTICLE_CONTENT_FORMATS,
    SITE_ARTICLE_MEDIA_ROLES,
    SITE_ARTICLE_REVISION_SOURCES,
    SITE_ARTICLE_SECTIONS,
    SITE_ARTICLE_STATUSES,
    SITE_ARTICLE_TYPES,
    type SiteArticleStatus,
} from '../domain/site-article.const';
import { readStoredBlocks } from '../domain/site-article-content.parse';
import { parseArticleMeta } from '../domain/site-article-props';
import {
    articleState,
    type SiteArticleMediaLink,
    type SiteArticleRecord,
    type SiteArticleRevisionRecord,
    type SiteArticleRevisionSummary,
} from '../domain/site-article.types';

/** Что читается вместе со статьёй: номер и заголовок последней и опубликованной версий. */
export const SITE_ARTICLE_STATE_INCLUDE = {
    publishedRevision: { select: { number: true, title: true } },
    revisions: {
        orderBy: { number: 'desc' },
        take: 1,
        select: { number: true, title: true },
    },
} as const satisfies Prisma.SiteArticleInclude;

export type SiteArticleRow = SiteArticle & {
    publishedRevision: { number: number; title: string } | null;
    revisions: { number: number; title: string }[];
};

/** Неизвестный статус (строку правили руками) не показываем на сайте. */
const statusOf = (row: SiteArticle): SiteArticleStatus =>
    isOneOf(SITE_ARTICLE_STATUSES, row.status)
        ? row.status
        : row.publishedRevisionId
          ? 'unpublished'
          : 'draft';

/**
 * Строка site_articles → запись домена; null — раздел неизвестен коду
 * (такую статью сайт всё равно не нарисует).
 */
export function toArticleRecord(row: SiteArticleRow): SiteArticleRecord | null {
    const section = oneOfOrNull(SITE_ARTICLE_SECTIONS, row.section);
    if (!section) return null;
    const meta = parseArticleMeta(row.meta);
    const latest = row.revisions[0];
    return {
        id: row.id,
        section,
        type: oneOfOrNull(SITE_ARTICLE_TYPES, row.type) ?? 'article',
        slug: row.slug,
        status: statusOf(row),
        sort: row.sort,
        meta: meta.ok ? meta.meta : null,
        publishedRevisionId: row.publishedRevisionId,
        publishedAt: row.publishedAt,
        publishedBy: row.publishedBy,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        state: articleState(
            latest?.number ?? 0,
            row.publishedRevision?.number ?? null,
        ),
        title: latest?.title ?? null,
    };
}

export const toArticleRecords = (rows: SiteArticleRow[]): SiteArticleRecord[] =>
    rows.flatMap(row => {
        const record = toArticleRecord(row);
        return record ? [record] : [];
    });

type RevisionSummaryRow = Pick<
    SiteArticleRevision,
    | 'id'
    | 'articleId'
    | 'number'
    | 'source'
    | 'contentFormat'
    | 'title'
    | 'baseCodeHash'
    | 'comment'
    | 'createdBy'
    | 'createdAt'
>;

/** Версия в истории — без текста; перечни из базы проверяются. */
export const toRevisionSummary = (
    row: RevisionSummaryRow,
): SiteArticleRevisionSummary => ({
    id: row.id,
    articleId: row.articleId,
    number: row.number,
    source: oneOfOrNull(SITE_ARTICLE_REVISION_SOURCES, row.source) ?? 'admin',
    contentFormat:
        oneOfOrNull(SITE_ARTICLE_CONTENT_FORMATS, row.contentFormat) ??
        'theory-v1',
    title: row.title,
    baseCodeHash: row.baseCodeHash,
    comment: row.comment,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
});

export const toRevisionRecord = (
    row: SiteArticleRevision,
): SiteArticleRevisionRecord => ({
    ...toRevisionSummary(row),
    eyebrow: row.eyebrow,
    description: row.description,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    blocks: readStoredBlocks(row.blocks),
});

export type SiteArticleMediaRow = SiteArticleMedia & { media: SiteMediaRow };

/** Связь с неизвестной ролью пропускается — сайт не знает, куда её ставить. */
export const toMediaLinks = (
    rows: SiteArticleMediaRow[],
): SiteArticleMediaLink[] =>
    rows.flatMap(row => {
        const role = oneOfOrNull(SITE_ARTICLE_MEDIA_ROLES, row.role);
        return role
            ? [
                  {
                      id: row.id,
                      articleId: row.articleId,
                      mediaId: row.mediaId,
                      role,
                      slot: row.slot,
                      sort: row.sort,
                      caption: row.caption,
                      createdBy: row.createdBy,
                      createdAt: row.createdAt,
                      updatedAt: row.updatedAt,
                      media: toSiteMediaRecord(row.media),
                  },
              ]
            : [];
    });
