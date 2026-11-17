import { ConflictException, NotFoundException } from '@nestjs/common';
import { statusRefusal } from '../domain/site-article-status';
import {
    createArticlesHarness,
    LEAD_BLOCKS,
    type ArticlesHarness,
} from './support/articles-harness';

describe('SiteArticlePublishingService', () => {
    let h: ArticlesHarness;
    let articleId: string;
    let revisionId: string;

    beforeEach(async () => {
        h = createArticlesHarness();
        const article = await h.articles.create(
            { section: 'articles', type: 'news', slug: 'kpi' },
            null,
        );
        articleId = article.id;
        ({
            revision: { id: revisionId },
        } = await h.drafts.save(
            articleId,
            { expectedNumber: 0, title: 'KPI', blocks: LEAD_BLOCKS },
            null,
        ));
    });

    it('публикация: статус, указатель на версию, кто и когда', async () => {
        const article = await h.publishing.publish(
            articleId,
            revisionId,
            'owner',
        );
        expect(article).toMatchObject({
            status: 'published',
            publishedRevisionId: revisionId,
            publishedBy: 'owner',
            state: { latestNumber: 1, publishedNumber: 1, hasDraft: false },
        });
        expect(article.publishedAt).toBeInstanceOf(Date);
    });

    it('новая версия после публикации — черновик; публикация её — сайт видит новую', async () => {
        await h.publishing.publish(articleId, revisionId, null);
        const { revision, article } = await h.drafts.save(
            articleId,
            { expectedNumber: 1, title: 'KPI 2', blocks: LEAD_BLOCKS },
            null,
        );
        expect(article.state.hasDraft).toBe(true);
        const republished = await h.publishing.publish(
            articleId,
            revision.id,
            null,
        );
        expect(republished.state).toEqual({
            latestNumber: 2,
            publishedNumber: 2,
            hasDraft: false,
        });
    });

    it('версия другой статьи — 404', async () => {
        const other = await h.articles.create(
            { section: 'articles', type: 'news', slug: 'other' },
            null,
        );
        await expect(
            h.publishing.publish(other.id, revisionId, null),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('снять — только опубликованную; снятая публикуется снова', async () => {
        await expect(h.publishing.unpublish(articleId, null)).rejects.toThrow(
            statusRefusal('unpublish'),
        );
        await h.publishing.publish(articleId, revisionId, null);
        await expect(
            h.publishing.unpublish(articleId, null),
        ).resolves.toMatchObject({
            status: 'unpublished',
            publishedRevisionId: revisionId,
        });
        await expect(
            h.publishing.publish(articleId, revisionId, null),
        ).resolves.toMatchObject({ status: 'published' });
    });

    it('архив: публиковать нельзя; из архива — снятой или черновиком', async () => {
        await h.publishing.archive(articleId, null);
        await expect(
            h.publishing.publish(articleId, revisionId, null),
        ).rejects.toThrow(statusRefusal('publish'));
        await expect(h.publishing.archive(articleId, null)).rejects.toThrow(
            statusRefusal('archive'),
        );
        await expect(
            h.publishing.unarchive(articleId, null),
        ).resolves.toMatchObject({
            status: 'draft',
        });
        await h.publishing.publish(articleId, revisionId, null);
        await h.publishing.archive(articleId, null);
        await expect(
            h.publishing.unarchive(articleId, null),
        ).resolves.toMatchObject({
            status: 'unpublished',
        });
    });

    it('статус успели сменить между проверкой и записью — 409', async () => {
        await h.publishing.publish(articleId, revisionId, null);
        const stale = await h.articles.get(articleId);
        await h.publishing.archive(articleId, null);
        jest.spyOn(h.articles, 'get').mockResolvedValueOnce(stale);
        await expect(
            h.publishing.unpublish(articleId, null),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});
