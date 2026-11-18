import { BadRequestException } from '@nestjs/common';
import {
    parseArticleBlocks,
    type SiteArticleBlock,
} from '../domain/site-article-content.parse';
import type { SiteArticleContentFormat } from '../domain/site-article.const';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import {
    normalizeArticleSlug,
    parseArticleMeta,
    SITE_ARTICLE_SLUG_RULE,
    type SiteArticleMeta,
} from '../domain/site-article-props';

/** Проверки ввода админки, общие для сценариев статей: ошибка — 400 по-русски. */

export function requireSlug(raw: string): string {
    const slug = normalizeArticleSlug(raw);
    if (!slug) throw new BadRequestException(SITE_ARTICLE_SLUG_RULE);
    return slug;
}

export function requireMeta(value: unknown): SiteArticleMeta | null {
    const result = parseArticleMeta(value);
    if (!result.ok) throw new BadRequestException(result.message);
    return result.meta;
}

/**
 * Блоки по формату. Проблемы уходят списком: глобальный фильтр отдаёт их
 * админке в `errors`, первой строкой — общее «не прошли проверку».
 */
export function requireBlocks(
    format: SiteArticleContentFormat,
    value: unknown,
): SiteArticleBlock[] {
    const result = parseArticleBlocks(format, value);
    if (result.ok) return result.blocks;
    throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: [
            SITE_ARTICLE_MESSAGES.blocksInvalid,
            ...result.problems.map(problem => problem.message),
        ],
    });
}
