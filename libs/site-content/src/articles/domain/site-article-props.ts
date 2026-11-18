import {
    SITE_ARTICLE_INDEX_SLUG,
    SITE_ARTICLE_LIMITS,
    SITE_ARTICLE_SLUG_MAX_LENGTH,
    SITE_ARTICLE_SLUG_PATTERN,
} from './site-article.const';
import {
    findJsonProblem,
    isPlainObject,
    jsonBytes,
    type SiteArticleJsonObject,
} from './site-article-json';

/**
 * Дополнительные свойства статьи без своей колонки (site_articles.meta):
 * метки, «для кого статья» и т. п. Состав задаёт код сайта; бэк проверяет
 * только форму — объект JSON до 16 КБ. Видны на сайте всем.
 */
export type SiteArticleMeta = SiteArticleJsonObject;

export type SiteArticleMetaResult =
    | { ok: true; meta: SiteArticleMeta | null }
    | { ok: false; message: string };

const META_LIMITS = {
    maxString: SITE_ARTICLE_LIMITS.string,
    maxDepth: 8,
} as const;

/** null и undefined — «свойств нет». */
export function parseArticleMeta(value: unknown): SiteArticleMetaResult {
    if (value === null || value === undefined) return { ok: true, meta: null };
    if (!isPlainObject(value)) {
        return {
            ok: false,
            message: 'Свойства статьи — объект «ключ: значение»',
        };
    }
    const problem = findJsonProblem(value, META_LIMITS);
    if (problem) {
        return {
            ok: false,
            message: `Свойства статьи: поле «${problem.path}» — ${problem.message}`,
        };
    }
    const meta = value as SiteArticleMeta;
    if (jsonBytes(meta) > SITE_ARTICLE_LIMITS.metaBytes) {
        return {
            ok: false,
            message: `Свойства статьи больше ${SITE_ARTICLE_LIMITS.metaBytes / 1024} КБ`,
        };
    }
    return { ok: true, meta: Object.keys(meta).length > 0 ? meta : null };
}

/**
 * Адрес статьи внутри раздела из админки или запроса сайта → slug или null.
 * Слэши по краям срезаются, пустой адрес — обзорная глава раздела (index).
 * Регистр не исправляется: адрес с заглавными — ошибка, а не другой адрес.
 */
export function normalizeArticleSlug(raw: string): string | null {
    const slug =
        raw.trim().replace(/^\/+|\/+$/g, '') || SITE_ARTICLE_INDEX_SLUG;
    return slug.length <= SITE_ARTICLE_SLUG_MAX_LENGTH &&
        SITE_ARTICLE_SLUG_PATTERN.test(slug)
        ? slug
        : null;
}

export const SITE_ARTICLE_SLUG_RULE =
    'Адрес статьи — латиница в нижнем регистре, цифры и дефисы, части через «/», до 191 знака: например, theory/call-analysis';
