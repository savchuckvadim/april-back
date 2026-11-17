import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import { SITE_ARTICLE_SLUG_RULE } from '../domain/site-article-props';
import {
    createArticlesHarness,
    LEAD_BLOCKS,
    type ArticlesHarness,
} from './support/articles-harness';

describe('SiteArticlesService', () => {
    let h: ArticlesHarness;

    beforeEach(() => {
        h = createArticlesHarness();
    });

    const createOpen = (slug = 'news/kpi') =>
        h.articles.create({ section: 'articles', type: 'news', slug }, 'admin');

    describe('создание', () => {
        it('в открытом разделе — черновик без версий', async () => {
            const article = await h.articles.create(
                {
                    section: 'articles',
                    type: 'guide',
                    slug: '/guides/setup/',
                    meta: { audience: 'rop' },
                },
                'admin',
            );
            expect(article).toMatchObject({
                section: 'articles',
                type: 'guide',
                slug: 'guides/setup',
                status: 'draft',
                sort: 500,
                meta: { audience: 'rop' },
                createdBy: 'admin',
                state: {
                    latestNumber: 0,
                    publishedNumber: null,
                    hasDraft: false,
                },
            });
        });

        it.each([
            [
                'раздел с главами в коде',
                { section: 'ai', type: 'article' },
                SITE_ARTICLE_MESSAGES.createNotOpen,
            ],
            [
                'тип «глава»',
                { section: 'articles', type: 'chapter' },
                SITE_ARTICLE_MESSAGES.createChapter,
            ],
        ] as const)('%s — 400', async (_name, props, message) => {
            await expect(
                h.articles.create({ ...props, slug: 'x' }, null),
            ).rejects.toThrow(message);
        });

        it('кривой адрес и кривые свойства — 400, занятый адрес — 409', async () => {
            await expect(
                h.articles.create(
                    { section: 'articles', type: 'news', slug: 'Про KPI' },
                    null,
                ),
            ).rejects.toThrow(SITE_ARTICLE_SLUG_RULE);
            await expect(
                h.articles.create(
                    {
                        section: 'articles',
                        type: 'news',
                        slug: 'a',
                        meta: ['x'],
                    },
                    null,
                ),
            ).rejects.toBeInstanceOf(BadRequestException);
            await createOpen('a');
            await expect(createOpen('a')).rejects.toBeInstanceOf(
                ConflictException,
            );
        });
    });

    describe('глава из кода (ensure)', () => {
        it('первый вызов заводит главу, повторный возвращает ту же строку', async () => {
            const first = await h.articles.ensure(
                { section: 'ai', slug: '' },
                'admin',
            );
            expect(first.created).toBe(true);
            expect(first.article).toMatchObject({
                type: 'chapter',
                slug: 'index',
                status: 'draft',
            });
            const second = await h.articles.ensure(
                { section: 'ai', slug: 'index' },
                null,
            );
            expect(second).toEqual({ article: first.article, created: false });
        });

        it('гонка: строку успел завести соседний вызов — читаем её', async () => {
            const raced = await h.articles.ensure(
                { section: 'ai', slug: 'x' },
                null,
            );
            jest.spyOn(h.articleRepo, 'findBySlug')
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(raced.article);
            const result = await h.articles.ensure(
                { section: 'ai', slug: 'x' },
                null,
            );
            expect(result).toEqual({ article: raced.article, created: false });
        });

        it('в открытом разделе — 400', async () => {
            await expect(
                h.articles.ensure({ section: 'articles', slug: 'x' }, null),
            ).rejects.toThrow(SITE_ARTICLE_MESSAGES.ensureNotCode);
        });
    });

    describe('свойства', () => {
        it('до публикации меняются адрес, тип, порядок; свойства снимаются null', async () => {
            const article = await h.articles.create(
                {
                    section: 'articles',
                    type: 'news',
                    slug: 'a',
                    meta: { x: 1 },
                },
                null,
            );
            const updated = await h.articles.update(
                article.id,
                { slug: 'b', type: 'case', sort: 10, meta: null },
                'editor',
            );
            expect(updated).toMatchObject({
                slug: 'b',
                type: 'case',
                sort: 10,
                meta: null,
                updatedBy: 'editor',
            });
        });

        it('после публикации адрес и тип не меняются, порядок — меняется', async () => {
            const article = await createOpen();
            const { revision } = await h.drafts.save(
                article.id,
                { expectedNumber: 0, title: 'KPI', blocks: LEAD_BLOCKS },
                null,
            );
            await h.publishing.publish(article.id, revision.id, null);
            await expect(
                h.articles.update(article.id, { slug: 'other' }, null),
            ).rejects.toThrow(SITE_ARTICLE_MESSAGES.addressAfterPublish);
            await expect(
                h.articles.update(
                    article.id,
                    { slug: 'news/kpi', sort: 1 },
                    null,
                ),
            ).resolves.toMatchObject({ sort: 1 });
        });

        it('тип «глава» не меняется ни туда, ни обратно', async () => {
            const { article } = await h.articles.ensure(
                { section: 'ai', slug: 'x' },
                null,
            );
            await expect(
                h.articles.update(article.id, { type: 'article' }, null),
            ).rejects.toThrow(SITE_ARTICLE_MESSAGES.chapterTypeFixed);
            const open = await createOpen();
            await expect(
                h.articles.update(open.id, { type: 'chapter' }, null),
            ).rejects.toThrow(SITE_ARTICLE_MESSAGES.chapterTypeFixed);
        });
    });

    describe('удаление', () => {
        it('ни разу не публиковавшаяся удаляется вместе с версиями', async () => {
            const article = await createOpen();
            await h.drafts.save(
                article.id,
                { expectedNumber: 0, title: 'T', blocks: LEAD_BLOCKS },
                null,
            );
            await h.articles.remove(article.id);
            expect(h.store.articles.size).toBe(0);
            expect(h.store.revisions).toHaveLength(0);
            await expect(h.articles.get(article.id)).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });

        it('публиковавшуюся — нельзя, только в архив', async () => {
            const article = await createOpen();
            const { revision } = await h.drafts.save(
                article.id,
                { expectedNumber: 0, title: 'T', blocks: LEAD_BLOCKS },
                null,
            );
            await h.publishing.publish(article.id, revision.id, null);
            await h.publishing.archive(article.id, null);
            await expect(h.articles.remove(article.id)).rejects.toThrow(
                SITE_ARTICLE_MESSAGES.deletePublished,
            );
        });
    });
});
