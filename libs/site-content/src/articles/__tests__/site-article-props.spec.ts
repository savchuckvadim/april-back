import {
    normalizeArticleSlug,
    parseArticleMeta,
} from '../domain/site-article-props';
import {
    canApply,
    canDeleteForever,
    SITE_ARTICLE_STATUS_ACTIONS,
    statusAfter,
} from '../domain/site-article-status';
import { SITE_ARTICLE_STATUSES } from '../domain/site-article.const';
import { articleState } from '../domain/site-article.types';

describe('адрес статьи (slug)', () => {
    it.each([
        ['theory/call-analysis', 'theory/call-analysis'],
        ['/theory/call-analysis/', 'theory/call-analysis'],
        ['', 'index'],
        ['  /  ', 'index'],
        ['kpi-2026', 'kpi-2026'],
    ])('«%s» → %s', (raw, slug) => {
        expect(normalizeArticleSlug(raw)).toBe(slug);
    });

    it.each([
        'Theory/Call',
        'theory//call',
        'theory/../secret',
        'про-звонки',
        'a_b',
        '-a',
        'a-',
        'a b',
        'a'.repeat(192),
    ])('«%s» — не адрес', raw => {
        expect(normalizeArticleSlug(raw)).toBeNull();
    });
});

describe('свойства статьи (meta)', () => {
    it('объект JSON проходит, пустой и null — «свойств нет»', () => {
        expect(parseArticleMeta({ tags: ['kpi'], audience: 'rop' })).toEqual({
            ok: true,
            meta: { tags: ['kpi'], audience: 'rop' },
        });
        expect(parseArticleMeta({})).toEqual({ ok: true, meta: null });
        expect(parseArticleMeta(null)).toEqual({ ok: true, meta: null });
        expect(parseArticleMeta(undefined)).toEqual({ ok: true, meta: null });
    });

    it.each([
        ['список', ['a']],
        ['строка', 'tags'],
        ['не JSON', { at: new Date() }],
        ['больше 16 КБ', { text: 'x'.repeat(17 * 1024) }],
    ])('%s — отказ', (_name, value) => {
        expect(parseArticleMeta(value).ok).toBe(false);
    });
});

describe('статусы статьи', () => {
    const table: Record<string, string[]> = {
        publish: ['draft', 'published', 'unpublished'],
        unpublish: ['published'],
        archive: ['draft', 'published', 'unpublished'],
        unarchive: ['archived'],
    };

    it.each(SITE_ARTICLE_STATUS_ACTIONS)(
        '%s — допустимо только из своих статусов',
        action => {
            const allowed = SITE_ARTICLE_STATUSES.filter(status =>
                canApply(action, status),
            );
            expect(allowed).toEqual(table[action]);
        },
    );

    it('из архива: публиковавшаяся — снятой, никогда — черновиком', () => {
        expect(statusAfter('unarchive', true)).toBe('unpublished');
        expect(statusAfter('unarchive', false)).toBe('draft');
        expect(statusAfter('publish', false)).toBe('published');
    });

    it('удалить навсегда — только ни разу не публиковавшуюся', () => {
        expect(canDeleteForever(false)).toBe(true);
        expect(canDeleteForever(true)).toBe(false);
    });

    it('черновик — последняя версия новее опубликованной', () => {
        expect(articleState(0, null)).toEqual({
            latestNumber: 0,
            publishedNumber: null,
            hasDraft: false,
        });
        expect(articleState(3, null).hasDraft).toBe(true);
        expect(articleState(3, 3).hasDraft).toBe(false);
        expect(articleState(5, 2).hasDraft).toBe(true);
    });
});
