import {
    ConflictException,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, type SiteArticleRevision } from 'generated/prisma';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import type { SiteArticleRevisionInput } from '../domain/site-article.types';
import { SiteArticleRevisionPrismaRepository } from '../repositories/site-article-revision.prisma.repository';

const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError(`prisma ${code}`, {
        code,
        clientVersion: 'test',
    });

const INPUT: SiteArticleRevisionInput = {
    source: 'admin',
    contentFormat: 'theory-v1',
    eyebrow: null,
    title: 'T',
    description: null,
    seoTitle: null,
    seoDescription: null,
    blocks: [{ kind: 'lead', text: 'x' }],
    baseCodeHash: null,
    comment: null,
    createdBy: 'admin',
};

const revisionRow = (
    over: Partial<SiteArticleRevision> = {},
): SiteArticleRevision => ({
    id: 'r1',
    articleId: 'a1',
    number: 1,
    source: 'admin',
    contentFormat: 'theory-v1',
    eyebrow: null,
    title: 'T',
    description: null,
    seoTitle: null,
    seoDescription: null,
    blocks: [{ kind: 'lead', text: 'x' }],
    baseCodeHash: null,
    comment: null,
    createdBy: 'admin',
    createdAt: new Date(),
    ...over,
});

/** Prisma с интерактивной транзакцией: tx — тот же набор моделей. */
const createPrisma = () => {
    const models = {
        siteArticleRevision: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
        },
        siteArticle: { update: jest.fn() },
    };
    return {
        ...models,
        $transaction: jest.fn((work: (tx: typeof models) => Promise<unknown>) =>
            work(models),
        ),
    };
};

describe('SiteArticleRevisionPrismaRepository', () => {
    let prisma: ReturnType<typeof createPrisma>;
    let repository: SiteArticleRevisionPrismaRepository;

    beforeEach(() => {
        prisma = createPrisma();
        repository = new SiteArticleRevisionPrismaRepository(prisma as never);
    });

    it('новая версия: номер «последний + 1», статья помечена правкой — в одной транзакции', async () => {
        prisma.siteArticleRevision.findFirst.mockResolvedValue({ number: 3 });
        prisma.siteArticleRevision.create.mockImplementation(
            ({ data }: { data: SiteArticleRevision }) =>
                Promise.resolve(revisionRow(data)),
        );
        const revision = await repository.append('a1', 3, INPUT);
        expect(revision).toMatchObject({
            number: 4,
            articleId: 'a1',
            title: 'T',
        });
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.siteArticle.update).toHaveBeenCalledWith({
            where: { id: 'a1' },
            data: { updatedBy: 'admin', updatedAt: expect.any(Date) as Date },
        });
    });

    it('первая версия — при ожидаемом 0', async () => {
        prisma.siteArticleRevision.findFirst.mockResolvedValue(null);
        prisma.siteArticleRevision.create.mockImplementation(
            ({ data }: { data: SiteArticleRevision }) =>
                Promise.resolve(revisionRow(data)),
        );
        await expect(repository.append('a1', 0, INPUT)).resolves.toMatchObject({
            number: 1,
        });
    });

    it('ожидаемый номер устарел — 409, вставки нет', async () => {
        prisma.siteArticleRevision.findFirst.mockResolvedValue({ number: 5 });
        const call = repository.append('a1', 4, INPUT);
        await expect(call).rejects.toBeInstanceOf(ConflictException);
        await expect(call).rejects.toThrow(
            SITE_ARTICLE_MESSAGES.versionConflict,
        );
        expect(prisma.siteArticleRevision.create).not.toHaveBeenCalled();
    });

    it('гонка двух сохранений — уникальный ключ (P2002) → 409', async () => {
        prisma.siteArticleRevision.findFirst.mockResolvedValue({ number: 1 });
        prisma.siteArticleRevision.create.mockRejectedValue(
            prismaError('P2002'),
        );
        await expect(repository.append('a1', 1, INPUT)).rejects.toThrow(
            SITE_ARTICLE_MESSAGES.versionConflict,
        );
    });

    it('статьи нет (P2003) — 404; таблицы нет (P2021) — 503', async () => {
        prisma.siteArticleRevision.findFirst.mockResolvedValue(null);
        prisma.siteArticleRevision.create.mockRejectedValueOnce(
            prismaError('P2003'),
        );
        await expect(repository.append('a1', 0, INPUT)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        prisma.$transaction.mockRejectedValueOnce(prismaError('P2021'));
        await expect(repository.append('a1', 0, INPUT)).rejects.toBeInstanceOf(
            ServiceUnavailableException,
        );
    });

    it('чтение версии: перечни из базы проверяются, блоки — только по форме', async () => {
        prisma.siteArticleRevision.findFirst.mockResolvedValue(
            revisionRow({
                source: 'robot',
                contentFormat: 'v9',
                blocks: [{ kind: 'lead', text: 'x' }, 42],
            }),
        );
        await expect(repository.get('a1', 'r1')).resolves.toMatchObject({
            source: 'admin',
            contentFormat: 'theory-v1',
            blocks: [{ kind: 'lead', text: 'x' }],
        });
        const [args] = prisma.siteArticleRevision.findFirst.mock.calls[0] as [
            { where: unknown },
        ];
        expect(args.where).toEqual({ id: 'r1', articleId: 'a1' });
    });
});
