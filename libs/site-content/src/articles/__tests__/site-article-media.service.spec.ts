import { ConflictException, NotFoundException } from '@nestjs/common';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import {
    createArticlesHarness,
    type ArticlesHarness,
} from './support/articles-harness';

describe('SiteArticleMediaService', () => {
    let h: ArticlesHarness;
    let articleId: string;

    beforeEach(async () => {
        h = createArticlesHarness();
        ({
            article: { id: articleId },
        } = await h.articles.ensure(
            { section: 'ai', slug: 'theory/kpi' },
            null,
        ));
    });

    it('обложка — место cover, только картинка; повторная привязка заменяет', async () => {
        const first = h.addMedia();
        const second = h.addMedia();
        const video = h.addMedia({ kind: 'video', mime: 'video/mp4' });
        const link = await h.media.put(
            articleId,
            { role: 'cover', slot: 'whatever', mediaId: first.id },
            'admin',
        );
        expect(link).toMatchObject({
            role: 'cover',
            slot: 'cover',
            mediaId: first.id,
        });
        const replaced = await h.media.put(
            articleId,
            { role: 'cover', mediaId: second.id, caption: '  ' },
            null,
        );
        expect(replaced).toMatchObject({
            id: link.id,
            mediaId: second.id,
            caption: null,
        });
        await expect(
            h.media.put(articleId, { role: 'cover', mediaId: video.id }, null),
        ).rejects.toThrow(SITE_ARTICLE_MESSAGES.coverNotImage);
    });

    it('место в тексте: id блока по шаблону, одно медиа на место', async () => {
        const image = h.addMedia();
        const embed = h.addMedia({
            kind: 'embed',
            fileName: null,
            embedProvider: 'youtube',
            embedId: 'dQw4w9WgXcQ',
        });
        await h.media.put(
            articleId,
            { role: 'inline', slot: 'scr-kpi', mediaId: image.id },
            null,
        );
        await h.media.put(
            articleId,
            { role: 'inline', slot: 'scr-kpi', mediaId: embed.id },
            null,
        );
        const links = await h.media.list(articleId);
        expect(links).toHaveLength(1);
        expect(links[0]).toMatchObject({ slot: 'scr-kpi', mediaId: embed.id });
        for (const slot of [undefined, '', 'Scr KPI', 'a'.repeat(65)]) {
            await expect(
                h.media.put(
                    articleId,
                    { role: 'inline', slot, mediaId: image.id },
                    null,
                ),
            ).rejects.toThrow(SITE_ARTICLE_MESSAGES.slotRequired);
        }
    });

    it('галерея: в конец по порядку, то же медиа не дублируется, порядок меняется', async () => {
        const [a, b, c] = [h.addMedia(), h.addMedia(), h.addMedia()];
        const la = await h.media.put(
            articleId,
            { role: 'gallery', mediaId: a.id },
            null,
        );
        const lb = await h.media.put(
            articleId,
            { role: 'gallery', mediaId: b.id },
            null,
        );
        const lc = await h.media.put(
            articleId,
            { role: 'gallery', mediaId: c.id },
            null,
        );
        expect([la.sort, lb.sort, lc.sort]).toEqual([10, 20, 30]);
        const again = await h.media.put(
            articleId,
            { role: 'gallery', mediaId: a.id, caption: 'новая' },
            null,
        );
        expect(again).toMatchObject({ id: la.id, caption: 'новая', sort: 10 });
        const reordered = await h.media.reorderGallery(articleId, [
            lc.id,
            la.id,
            lb.id,
        ]);
        expect(reordered.map(link => link.id)).toEqual([lc.id, la.id, lb.id]);
        await expect(
            h.media.reorderGallery(articleId, [lc.id, la.id]),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            h.media.reorderGallery(articleId, [lc.id, la.id, la.id]),
        ).rejects.toThrow(SITE_ARTICLE_MESSAGES.galleryChanged);
    });

    it('медиа нет в медиатеке, статьи нет, связь чужая — 404', async () => {
        await expect(
            h.media.put(articleId, { role: 'gallery', mediaId: 'nope' }, null),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            h.media.put(
                'nope',
                { role: 'gallery', mediaId: h.addMedia().id },
                null,
            ),
        ).rejects.toThrow(SITE_ARTICLE_MESSAGES.notFound);
        const other = await h.articles.ensure(
            { section: 'ai', slug: 'other' },
            null,
        );
        const link = await h.media.put(
            other.article.id,
            { role: 'gallery', mediaId: h.addMedia().id },
            null,
        );
        await expect(h.media.remove(articleId, link.id)).rejects.toThrow(
            SITE_ARTICLE_MESSAGES.linkNotFound,
        );
        await h.media.remove(other.article.id, link.id);
        expect(h.store.links).toHaveLength(0);
    });

    it('связь делает медиа «используемым»: удалить его из медиатеки нельзя', async () => {
        const image = h.addMedia();
        await h.media.put(
            articleId,
            { role: 'cover', mediaId: image.id },
            null,
        );
        const usages = await h.store.media.usage(image.id);
        expect(usages).toEqual([
            expect.objectContaining({
                articleId,
                section: 'ai',
                slug: 'theory/kpi',
                role: 'cover',
            }),
        ]);
    });
});
