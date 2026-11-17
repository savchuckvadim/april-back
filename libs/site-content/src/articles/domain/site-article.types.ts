import type { SiteMediaRecord } from '../../library/domain/site-media-library.types';
import type {
    SiteArticleContentFormat,
    SiteArticleMediaRole,
    SiteArticleRevisionSource,
    SiteArticleSection,
    SiteArticleStatus,
    SiteArticleType,
} from './site-article.const';
import type { SiteArticleBlock } from './site-article-content.parse';
import type { SiteArticleMeta } from './site-article-props';

/**
 * Версии статьи: номер последней, номер опубликованной и есть ли черновик
 * (последняя версия новее опубликованной). Черновик отдельно не хранится.
 */
export interface SiteArticleState {
    latestNumber: number;
    publishedNumber: number | null;
    hasDraft: boolean;
}

export const articleState = (
    latestNumber: number,
    publishedNumber: number | null,
): SiteArticleState => ({
    latestNumber,
    publishedNumber,
    hasDraft: latestNumber > (publishedNumber ?? 0),
});

/** Строка site_articles в терминах домена. */
export interface SiteArticleRecord {
    id: string;
    section: SiteArticleSection;
    type: SiteArticleType;
    slug: string;
    status: SiteArticleStatus;
    sort: number;
    meta: SiteArticleMeta | null;
    publishedRevisionId: string | null;
    publishedAt: Date | null;
    publishedBy: string | null;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    state: SiteArticleState;
    /** Заголовок последней версии; null — версий в базе нет (глава из кода). */
    title: string | null;
}

export interface SiteArticleListFilter {
    section?: SiteArticleSection;
    type?: SiteArticleType;
    status?: SiteArticleStatus;
}

export interface SiteArticleCreateInput {
    id: string;
    section: SiteArticleSection;
    type: SiteArticleType;
    slug: string;
    sort: number;
    meta: SiteArticleMeta | null;
    createdBy: string | null;
}

/** Правка свойств статьи; не переданное не меняется. */
export interface SiteArticlePropsPatch {
    sort?: number;
    type?: SiteArticleType;
    slug?: string;
    meta?: SiteArticleMeta | null;
}

/** Смена статуса: из каких статусов допустима и что ставится. */
export interface SiteArticleTransition {
    from: readonly SiteArticleStatus[];
    status: SiteArticleStatus;
    by: string | null;
    /** Публикация: какая версия становится действующей. */
    publishRevisionId?: string;
}

/** Текст версии: заголовки, описание, поля для поисковиков, блоки. */
export interface SiteArticleRevisionContent {
    contentFormat: SiteArticleContentFormat;
    eyebrow: string | null;
    title: string;
    description: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    blocks: SiteArticleBlock[];
}

export interface SiteArticleRevisionInput extends SiteArticleRevisionContent {
    source: SiteArticleRevisionSource;
    baseCodeHash: string | null;
    comment: string | null;
    createdBy: string | null;
}

export interface SiteArticleRevisionRecord extends SiteArticleRevisionInput {
    id: string;
    articleId: string;
    number: number;
    createdAt: Date | null;
}

/** Текст версии без служебных полей: для сайта и для копии версии. */
export const revisionContentOf = (
    revision: SiteArticleRevisionContent,
): SiteArticleRevisionContent => ({
    contentFormat: revision.contentFormat,
    eyebrow: revision.eyebrow,
    title: revision.title,
    description: revision.description,
    seoTitle: revision.seoTitle,
    seoDescription: revision.seoDescription,
    blocks: revision.blocks,
});

/** Версия в истории — без текста. */
export type SiteArticleRevisionSummary = Pick<
    SiteArticleRevisionRecord,
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

/** Опубликованная статья в перечне раздела — без блоков. */
export interface SiteArticlePublishedSummary {
    article: SiteArticleRecord;
    revision: Pick<
        SiteArticleRevisionRecord,
        'eyebrow' | 'title' | 'description'
    >;
}

/** Где в статье стоит медиа (site_article_media) — вместе с самим медиа. */
export interface SiteArticleMediaLink {
    id: string;
    articleId: string;
    mediaId: string;
    role: SiteArticleMediaRole;
    slot: string | null;
    sort: number;
    /** Подпись в этой статье; null — подпись медиа по умолчанию. */
    caption: string | null;
    createdBy: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    media: SiteMediaRecord;
}

export interface SiteArticleMediaLinkInput {
    articleId: string;
    mediaId: string;
    role: SiteArticleMediaRole;
    slot: string | null;
    sort: number | null;
    caption: string | null;
    createdBy: string | null;
}
