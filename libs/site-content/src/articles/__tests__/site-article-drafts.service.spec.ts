import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import {
    createArticlesHarness,
    LEAD_BLOCKS,
    type ArticlesHarness,
} from './support/articles-harness';

/** Тело ошибки 400 с проблемами блоков — как его получит админка. */
const messagesOf = (error: unknown): string[] => {
    const response = (error as BadRequestException).getResponse() as {
        message: string[];
    };
    return response.message;
};

describe('SiteArticleDraftsService', () => {
    let h: ArticlesHarness;
    let articleId: string;

    beforeEach(async () => {
        h = createArticlesHarness();
        ({
            article: { id: articleId },
        } = await h.articles.ensure(
            { section: 'ai', slug: 'theory/call-analysis' },
            null,
        ));
    });

    const save = (expectedNumber: number, title = 'Разбор звонка') =>
        h.drafts.save(
            articleId,
            {
                expectedNumber,
                source: 'code',
                title: `  ${title}  `,
                eyebrow: '',
                description: 'Описание',
                blocks: LEAD_BLOCKS,
                baseCodeHash: 'abc123',
            },
            'admin',
        );

    it('черновик — новая версия с номером «последний + 1» и пометкой «есть черновик»', async () => {
        const first = await save(0);
        expect(first.revision).toMatchObject({
            number: 1,
            source: 'code',
            contentFormat: 'theory-v1',
            title: 'Разбор звонка',
            eyebrow: null,
            baseCodeHash: 'abc123',
            createdBy: 'admin',
        });
        expect(first.article.state).toEqual({
            latestNumber: 1,
            publishedNumber: null,
            hasDraft: true,
        });
        const second = await save(1, 'Вторая');
        expect(second.revision.number).toBe(2);
        expect(second.article.title).toBe('Вторая');
    });

    it('ожидаемый номер устарел — 409, версия не добавлена', async () => {
        await save(0);
        const call = save(0);
        await expect(call).rejects.toBeInstanceOf(ConflictException);
        await expect(call).rejects.toThrow(
            SITE_ARTICLE_MESSAGES.versionConflict,
        );
        expect(h.store.revisions).toHaveLength(1);
    });

    it('кривые блоки — 400 со списком проблем, версия не добавлена', async () => {
        const error: unknown = await h.drafts
            .save(
                articleId,
                {
                    expectedNumber: 0,
                    title: 'T',
                    blocks: [
                        { kind: 'lead' },
                        { kind: 'note', tone: 'x', text: 'y' },
                    ],
                },
                null,
            )
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(BadRequestException);
        expect(messagesOf(error)).toEqual([
            SITE_ARTICLE_MESSAGES.blocksInvalid,
            'Блок 1 (lead): поле «text» — обязательный непустой текст',
            'Блок 2 (note): поле «tone» — одно из: good, warn, bad, neutral',
        ]);
        expect(h.store.revisions).toHaveLength(0);
    });

    it.each([
        [
            'формат не раздела',
            { contentFormat: 'how-v1' as const },
            SITE_ARTICLE_MESSAGES.formatMismatch,
        ],
        [
            'пустой заголовок',
            { title: '   ' },
            SITE_ARTICLE_MESSAGES.titleRequired,
        ],
    ])('%s — 400', async (_name, over, message) => {
        await expect(
            h.drafts.save(
                articleId,
                { expectedNumber: 0, title: 'T', blocks: LEAD_BLOCKS, ...over },
                null,
            ),
        ).rejects.toThrow(message);
    });

    it('в архиве черновик не сохраняется', async () => {
        await h.publishing.archive(articleId, null);
        await expect(save(0)).rejects.toThrow(
            SITE_ARTICLE_MESSAGES.draftArchived,
        );
    });

    it('история — новые первыми; версия целиком; чужая версия — 404', async () => {
        const { revision: first } = await save(0, 'Первая');
        await save(1, 'Вторая');
        const history = await h.drafts.list(articleId);
        expect(history.map(item => item.number)).toEqual([2, 1]);
        await expect(h.drafts.get(articleId, first.id)).resolves.toMatchObject({
            title: 'Первая',
            blocks: LEAD_BLOCKS,
        });
        const other = await h.articles.ensure(
            { section: 'ai', slug: 'other' },
            null,
        );
        await expect(
            h.drafts.get(other.article.id, first.id),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('вернуть прежнюю — копия поверх последней с source = restore', async () => {
        const { revision: first } = await save(0, 'Первая');
        await save(1, 'Вторая');
        const restored = await h.drafts.restore(
            articleId,
            first.id,
            2,
            null,
            'admin',
        );
        expect(restored.revision).toMatchObject({
            number: 3,
            source: 'restore',
            title: 'Первая',
            blocks: LEAD_BLOCKS,
            baseCodeHash: 'abc123',
            comment: 'Копия версии 1',
        });
        await expect(
            h.drafts.restore(articleId, first.id, 2, null, null),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});
