import type { SiteArticleStatus } from './site-article.const';

/** Действия со статусом статьи из админки. */
export const SITE_ARTICLE_STATUS_ACTIONS = [
    'publish',
    'unpublish',
    'archive',
    'unarchive',
] as const;
export type SiteArticleStatusAction =
    (typeof SITE_ARTICLE_STATUS_ACTIONS)[number];

/**
 * Из каких статусов действие допустимо:
 * - опубликовать — из черновика, опубликованной (другая версия) и снятой;
 * - снять — только опубликованную;
 * - в архив — из любого, кроме архива;
 * - из архива — только архивную.
 */
export const SITE_ARTICLE_ALLOWED_FROM = {
    publish: ['draft', 'published', 'unpublished'],
    unpublish: ['published'],
    archive: ['draft', 'published', 'unpublished'],
    unarchive: ['archived'],
} as const satisfies Record<
    SiteArticleStatusAction,
    readonly SiteArticleStatus[]
>;

const REFUSALS: Record<SiteArticleStatusAction, string> = {
    publish: 'Статья в архиве — сначала верните её из архива, затем публикуйте',
    unpublish: 'Снять можно только опубликованную статью',
    archive: 'Статья уже в архиве',
    unarchive: 'Статья не в архиве',
};

export const canApply = (
    action: SiteArticleStatusAction,
    status: SiteArticleStatus,
): boolean =>
    (
        SITE_ARTICLE_ALLOWED_FROM[action] as readonly SiteArticleStatus[]
    ).includes(status);

export const statusRefusal = (action: SiteArticleStatusAction): string =>
    REFUSALS[action];

/**
 * Статус после действия. Из архива статья возвращается снятой, если её
 * хоть раз публиковали, иначе — черновиком (снятой «никогда не
 * опубликованной» статьи не бывает).
 */
export function statusAfter(
    action: SiteArticleStatusAction,
    everPublished: boolean,
): SiteArticleStatus {
    switch (action) {
        case 'publish':
            return 'published';
        case 'unpublish':
            return 'unpublished';
        case 'archive':
            return 'archived';
        case 'unarchive':
            return everPublished ? 'unpublished' : 'draft';
    }
}

/** Удалить навсегда можно только статью, которую ни разу не публиковали. */
export const canDeleteForever = (everPublished: boolean): boolean =>
    !everPublished;
