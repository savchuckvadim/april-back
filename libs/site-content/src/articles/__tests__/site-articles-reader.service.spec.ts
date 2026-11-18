import { NotFoundException } from '@nestjs/common';
import {
    createArticlesHarness,
    LEAD_BLOCKS,
    type ArticlesHarness,
} from './support/articles-harness';

describe('SiteArticlesReaderService', () => {
    let h: ArticlesHarness;

    beforeEach(() => {
        h = createArticlesHarness();
    });

    const publishOpen = async (slug: string, sort = 500) => {
        const article = await h.articles.create(
            {
                section: 'articles',
                type: 'news',
                slug,
                sort,
                meta: { audience: 'rop' },
            },
            null,
        );
        const { revision } = await h.drafts.save(
            article.id,
            {
                expectedNumber: 0,
                title: `Статья ${slug}`,
                description: 'Описание',
                seoTitle: 'SEO',
                blocks: LEAD_BLOCKS,
            },
            null,
        );
        await h.publishing.publish(article.id, revision.id, 'owner');
        return article.id;
    };

    it('опубликованная: текст опубликованной версии и медиа по местам', async () => {
        const id = await publishOpen('kpi');
        await h.drafts.save(
            id,
            { expectedNumber: 1, title: 'Черновик', blocks: LEAD_BLOCKS },
            null,
        );
        const cover = h.addMedia();
        const inline = h.addMedia({ caption: 'по умолчанию' });
        const embed = h.addMedia({
            kind: 'embed',
            fileName: null,
            embedProvider: 'rutube',
            embedId: 'x'.repeat(32),
        });
        const broken = h.addMedia({
            kind: 'embed',
            fileName: null,
            embedProvider: null,
            embedId: null,
        });
        await h.media.put(id, { role: 'cover', mediaId: cover.id }, null);
        await h.media.put(
            id,
            {
                role: 'inline',
                slot: 'scr-a',
                mediaId: inline.id,
                caption: 'своя',
            },
            null,
        );
        await h.media.put(id, { role: 'gallery', mediaId: embed.id }, null);
        await h.media.put(id, { role: 'gallery', mediaId: broken.id }, null);

        const view = await h.reader.article('articles', 'kpi');
        expect(view.content).toMatchObject({
            title: 'Статья kpi',
            seoTitle: 'SEO',
            blocks: LEAD_BLOCKS,
        });
        expect(view).toMatchObject({
            section: 'articles',
            slug: 'kpi',
            type: 'news',
            meta: { audience: 'rop' },
        });
        expect(view.publishedAt).toBeInstanceOf(Date);
        expect(view.media.cover).toMatchObject({
            id: cover.id,
            url: `/media/library/${cover.fileName}`,
        });
        expect(view.media.slots).toEqual({
            'scr-a': expect.objectContaining({
                id: inline.id,
                caption: 'своя',
            }) as unknown,
        });
        expect(view.media.gallery).toEqual([
            expect.objectContaining({
                id: embed.id,
                url: null,
                embed: { provider: 'rutube', id: 'x'.repeat(32) },
            }),
        ]);
        expect(JSON.stringify(view)).not.toContain('uploadedBy');
    });

    it('глава из кода без публикации — content: null и медиа мест', async () => {
        const { article } = await h.articles.ensure(
            { section: 'ai', slug: 'theory/kpi' },
            null,
        );
        await h.drafts.save(
            article.id,
            { expectedNumber: 0, title: 'Черновик', blocks: LEAD_BLOCKS },
            null,
        );
        const shot = h.addMedia();
        await h.media.put(
            article.id,
            { role: 'inline', slot: 'scr-kpi', mediaId: shot.id },
            null,
        );
        const view = await h.reader.article('ai', '/theory/kpi/');
        expect(view.content).toBeNull();
        expect(view.publishedAt).toBeNull();
        expect(Object.keys(view.media.slots)).toEqual(['scr-kpi']);
    });

    it('строки нет: в разделе с главами в коде — пусто, в открытом — 404', async () => {
        await expect(h.reader.article('ai', '')).resolves.toMatchObject({
            slug: 'index',
            type: 'chapter',
            content: null,
            media: { cover: null, slots: {}, gallery: [] },
        });
        await expect(
            h.reader.article('articles', 'nope'),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(h.reader.article('ai', 'Bad Slug')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('статья без кода: черновик, снятая и архивная — 404', async () => {
        const draft = await h.articles.create(
            { section: 'articles', type: 'news', slug: 'draft' },
            null,
        );
        await expect(
            h.reader.article('articles', 'draft'),
        ).rejects.toBeInstanceOf(NotFoundException);
        const id = await publishOpen('gone');
        await h.publishing.unpublish(id, null);
        await expect(
            h.reader.article('articles', 'gone'),
        ).rejects.toBeInstanceOf(NotFoundException);
        void draft;
    });

    it('перечень раздела: только опубликованные, по порядку, с обложкой', async () => {
        const second = await publishOpen('second', 20);
        await publishOpen('first', 10);
        await h.articles.create(
            { section: 'articles', type: 'news', slug: 'draft' },
            null,
        );
        const cover = h.addMedia();
        await h.media.put(second, { role: 'cover', mediaId: cover.id }, null);
        const list = await h.reader.listSection('articles');
        expect(list.map(item => item.slug)).toEqual(['first', 'second']);
        expect(list[0]).toMatchObject({
            title: 'Статья first',
            cover: null,
            meta: { audience: 'rop' },
        });
        expect(list[1].cover).toMatchObject({ id: cover.id });
    });

    it('таблиц нет (миграция не применена): глава — из кода, перечень пуст, статья — 404', async () => {
        h.store.tablesMissing = true;
        await expect(
            h.reader.article('ai', 'theory/kpi'),
        ).resolves.toMatchObject({
            content: null,
        });
        await expect(h.reader.listSection('articles')).resolves.toEqual([]);
        await expect(
            h.reader.article('articles', 'kpi'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('прочие сбои базы не прячутся', async () => {
        jest.spyOn(h.articleRepo, 'findBySlug').mockRejectedValue(
            new Error('база упала'),
        );
        await expect(h.reader.article('ai', 'x')).rejects.toThrow('база упала');
    });
});
