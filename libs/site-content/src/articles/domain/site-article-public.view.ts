import {
    toSiteMediaPublicView,
    type SiteMediaPublicView,
} from '../../library/domain/site-media-library.view';
import type { SiteArticleSection, SiteArticleType } from './site-article.const';
import type { SiteArticleMeta } from './site-article-props';
import type {
    SiteArticleMediaLink,
    SiteArticlePublishedSummary,
    SiteArticleRecord,
    SiteArticleRevisionContent,
} from './site-article.types';

/** Медиа статьи по местам: обложка, места в тексте (id блока → медиа), галерея. */
export interface SiteArticlePublicMedia {
    cover: SiteMediaPublicView | null;
    slots: Record<string, SiteMediaPublicView>;
    gallery: SiteMediaPublicView[];
}

/** Статья для сайта: опубликованный текст (или null — показать код) и медиа. */
export interface SiteArticlePublicView {
    section: SiteArticleSection;
    slug: string;
    type: SiteArticleType;
    meta: SiteArticleMeta | null;
    publishedAt: Date | null;
    content: SiteArticleRevisionContent | null;
    media: SiteArticlePublicMedia;
}

/** Статья в перечне раздела: без блоков. */
export interface SiteArticlePublicListItem {
    slug: string;
    type: SiteArticleType;
    sort: number;
    meta: SiteArticleMeta | null;
    publishedAt: Date | null;
    eyebrow: string | null;
    title: string;
    description: string | null;
    cover: SiteMediaPublicView | null;
}

export const emptyArticleMedia = (): SiteArticlePublicMedia => ({
    cover: null,
    slots: {},
    gallery: [],
});

/** Нечего показать: ни файла, ни внешнего видео из белого списка. */
const isShowable = (view: SiteMediaPublicView): boolean =>
    view.url !== null || view.embed !== null;

const publicOf = (link: SiteArticleMediaLink): SiteMediaPublicView | null => {
    const view = toSiteMediaPublicView(link.media, link.caption);
    return isShowable(view) ? view : null;
};

/** Связи статьи → медиа по местам; галерея — по порядку (sort, затем время). */
export function buildArticleMedia(
    links: readonly SiteArticleMediaLink[],
): SiteArticlePublicMedia {
    const media = emptyArticleMedia();
    const gallery = links
        .filter(link => link.role === 'gallery')
        .sort(
            (a, b) =>
                a.sort - b.sort ||
                (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
        );
    for (const link of links) {
        const view = publicOf(link);
        if (!view) continue;
        if (link.role === 'cover') media.cover = view;
        if (link.role === 'inline' && link.slot) media.slots[link.slot] = view;
    }
    media.gallery = gallery.flatMap(link => {
        const view = publicOf(link);
        return view ? [view] : [];
    });
    return media;
}

export function toPublicListItem(
    summary: SiteArticlePublishedSummary,
    cover: SiteArticleMediaLink | undefined,
): SiteArticlePublicListItem {
    const { article, revision } = summary;
    return {
        slug: article.slug,
        type: article.type,
        sort: article.sort,
        meta: article.meta,
        publishedAt: article.publishedAt,
        eyebrow: revision.eyebrow,
        title: revision.title,
        description: revision.description,
        cover: cover ? publicOf(cover) : null,
    };
}

export const publicArticleView = (
    article: Pick<
        SiteArticleRecord,
        'section' | 'slug' | 'type' | 'meta' | 'publishedAt'
    >,
    content: SiteArticleRevisionContent | null,
    media: SiteArticlePublicMedia,
): SiteArticlePublicView => ({
    section: article.section,
    slug: article.slug,
    type: article.type,
    meta: article.meta,
    publishedAt: content ? article.publishedAt : null,
    content,
    media,
});
