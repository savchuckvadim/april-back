import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { SiteContentTablesMissingException } from '../../shared/site-content-prisma.errors';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import {
    toArticleRecord,
    type SiteArticleRow,
} from '../repositories/site-article.mapper';
import { SiteArticlePrismaRepository } from '../repositories/site-article.prisma.repository';

const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError(`prisma ${code}`, {
        code,
        clientVersion: 'test',
    });

const row = (over: Partial<SiteArticleRow> = {}): SiteArticleRow => ({
    id: 'a1',
    createdAt: null,
    updatedAt: null,
    section: 'articles',
    type: 'news',
    slug: 'kpi',
    status: 'draft',
    sort: 500,
    publishedRevisionId: null,
    publishedAt: null,
    publishedBy: null,
    meta: null,
    createdBy: null,
    updatedBy: null,
    publishedRevision: null,
    revisions: [],
    ...over,
});

const createPrisma = () => ({
    siteArticle: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
    },
});

describe('SiteArticlePrismaRepository', () => {
    let prisma: ReturnType<typeof createPrisma>;
    let repository: SiteArticlePrismaRepository;

    beforeEach(() => {
        prisma = createPrisma();
        repository = new SiteArticlePrismaRepository(prisma as never);
    });

    const input = {
        id: 'a1',
        section: 'articles' as const,
        type: 'news' as const,
        slug: 'kpi',
        sort: 500,
        meta: null,
        createdBy: 'admin',
    };

    it('создание: черновик, время ставится само, пустые свойства — NULL в базе', async () => {
        prisma.siteArticle.create.mockResolvedValue(row());
        await repository.create(input);
        const [{ data }] = prisma.siteArticle.create.mock.calls[0] as [
            { data: Record<string, unknown> },
        ];
        expect(data).toMatchObject({
            status: 'draft',
            updatedBy: 'admin',
            meta: Prisma.DbNull,
        });
        expect(data.createdAt).toBeInstanceOf(Date);
    });

    it('адрес занят (P2002) — 409', async () => {
        prisma.siteArticle.create.mockRejectedValue(prismaError('P2002'));
        await expect(repository.create(input)).rejects.toThrow(
            SITE_ARTICLE_MESSAGES.slugTaken,
        );
        prisma.siteArticle.update.mockRejectedValue(prismaError('P2002'));
        await expect(
            repository.updateProps('a1', { slug: 'x' }, null),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('правка свойств: meta null → NULL, не переданное — не трогается', async () => {
        prisma.siteArticle.update.mockResolvedValue(row());
        await repository.updateProps('a1', { meta: null, sort: 1 }, 'ed');
        const [{ data }] = prisma.siteArticle.update.mock.calls[0] as [
            { data: Record<string, unknown> },
        ];
        expect(data).toMatchObject({
            meta: Prisma.DbNull,
            sort: 1,
            updatedBy: 'ed',
        });
        await repository.updateProps('a1', { sort: 2 }, null);
        const [{ data: second }] = prisma.siteArticle.update.mock.calls[1] as [
            { data: Record<string, unknown> },
        ];
        expect('meta' in second).toBe(false);
    });

    it('смена статуса — условием в запросе; публикация ставит версию, время и автора', async () => {
        prisma.siteArticle.updateMany.mockResolvedValue({ count: 1 });
        prisma.siteArticle.findUnique.mockResolvedValue(
            row({ status: 'published' }),
        );
        await repository.transition('a1', {
            from: ['draft', 'published'],
            status: 'published',
            by: 'owner',
            publishRevisionId: 'r2',
        });
        const [args] = prisma.siteArticle.updateMany.mock.calls[0] as [
            { where: unknown; data: Record<string, unknown> },
        ];
        expect(args.where).toEqual({
            id: 'a1',
            status: { in: ['draft', 'published'] },
        });
        expect(args.data).toMatchObject({
            status: 'published',
            publishedRevisionId: 'r2',
            publishedBy: 'owner',
        });
        expect(args.data.publishedAt).toBeInstanceOf(Date);
    });

    it('статус успели сменить — 409; статьи нет — 404', async () => {
        prisma.siteArticle.updateMany.mockResolvedValue({ count: 0 });
        prisma.siteArticle.findUnique.mockResolvedValueOnce(
            row({ status: 'archived' }),
        );
        const transition = {
            from: ['published'] as const,
            status: 'unpublished' as const,
            by: null,
        };
        await expect(repository.transition('a1', transition)).rejects.toThrow(
            SITE_ARTICLE_MESSAGES.stateChanged,
        );
        prisma.siteArticle.findUnique.mockResolvedValueOnce(null);
        await expect(
            repository.transition('a1', transition),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('удаление — только без публикации: условие в запросе', async () => {
        prisma.siteArticle.deleteMany.mockResolvedValueOnce({ count: 1 });
        await repository.remove('a1');
        expect(prisma.siteArticle.deleteMany).toHaveBeenCalledWith({
            where: { id: 'a1', publishedRevisionId: null },
        });
        prisma.siteArticle.deleteMany.mockResolvedValue({ count: 0 });
        prisma.siteArticle.findUnique.mockResolvedValueOnce(
            row({ publishedRevisionId: 'r1' }),
        );
        await expect(repository.remove('a1')).rejects.toBeInstanceOf(
            BadRequestException,
        );
        prisma.siteArticle.findUnique.mockResolvedValueOnce(null);
        await expect(repository.remove('a1')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('перечень опубликованных: таблицы нет — исключение «миграция не применена»', async () => {
        prisma.siteArticle.findMany.mockRejectedValue(prismaError('P2021'));
        await expect(
            repository.listPublished('articles'),
        ).rejects.toBeInstanceOf(SiteContentTablesMissingException);
    });

    it('перечень опубликованных: заголовки — из опубликованной версии', async () => {
        prisma.siteArticle.findMany.mockResolvedValue([
            {
                ...row({ status: 'published', publishedRevisionId: 'r1' }),
                publishedRevision: {
                    number: 1,
                    title: 'Опубл.',
                    eyebrow: 'Новости',
                    description: 'D',
                },
                revisions: [{ number: 2, title: 'Черновик' }],
            },
        ]);
        const [item] = await repository.listPublished('articles');
        expect(item.revision).toEqual({
            eyebrow: 'Новости',
            title: 'Опубл.',
            description: 'D',
        });
        expect(item.article.state).toEqual({
            latestNumber: 2,
            publishedNumber: 1,
            hasDraft: true,
        });
    });

    it('строка из базы: неизвестный раздел пропускается, статус и тип — безопасно', () => {
        expect(toArticleRecord(row({ section: 'blog' }))).toBeNull();
        expect(
            toArticleRecord(
                row({ status: 'hidden', publishedRevisionId: 'r1' }),
            )?.status,
        ).toBe('unpublished');
        expect(toArticleRecord(row({ status: 'hidden' }))?.status).toBe(
            'draft',
        );
        expect(toArticleRecord(row({ type: 'podcast' }))?.type).toBe('article');
        expect(
            toArticleRecord(row({ meta: ['not', 'object'] }))?.meta,
        ).toBeNull();
    });
});
