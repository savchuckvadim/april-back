import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import type { SiteArticleMediaLinkInput } from '../domain/site-article.types';
import { SiteArticleMediaLinkPrismaRepository } from '../repositories/site-article-media-link.prisma.repository';

const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError(`prisma ${code}`, {
        code,
        clientVersion: 'test',
    });

const media = {
    id: 'm1',
    createdAt: null,
    updatedAt: null,
    kind: 'image',
    title: null,
    caption: null,
    alt: null,
    fileName: 'm1.0123456789ab.png',
    darkFileName: null,
    posterFileName: null,
    mime: 'image/png',
    sizeBytes: 1,
    width: 1,
    height: 1,
    durationSec: null,
    embedProvider: null,
    embedUrl: null,
    embedId: null,
    uploadedBy: null,
    _count: { usages: 1 },
};

const linkRow = (over: Record<string, unknown> = {}) => ({
    id: 'l1',
    createdAt: null,
    updatedAt: null,
    articleId: 'a1',
    mediaId: 'm1',
    role: 'gallery',
    slot: null,
    sort: 10,
    caption: null,
    createdBy: null,
    media,
    ...over,
});

const createPrisma = () => {
    const siteArticleMedia = {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
        aggregate: jest.fn(),
    };
    return {
        siteArticleMedia,
        $transaction: jest.fn(
            (
                work: (tx: {
                    siteArticleMedia: typeof siteArticleMedia;
                }) => Promise<unknown>,
            ) => work({ siteArticleMedia }),
        ),
    };
};

const input = (
    over: Partial<SiteArticleMediaLinkInput> = {},
): SiteArticleMediaLinkInput => ({
    articleId: 'a1',
    mediaId: 'm1',
    role: 'gallery',
    slot: null,
    sort: null,
    caption: null,
    createdBy: 'admin',
    ...over,
});

describe('SiteArticleMediaLinkPrismaRepository', () => {
    let prisma: ReturnType<typeof createPrisma>;
    let repository: SiteArticleMediaLinkPrismaRepository;

    beforeEach(() => {
        prisma = createPrisma();
        repository = new SiteArticleMediaLinkPrismaRepository(prisma as never);
    });

    it('место занято — правка той же связи (findFirst: в ключе может быть NULL)', async () => {
        prisma.siteArticleMedia.findFirst.mockResolvedValue(
            linkRow({ role: 'cover', slot: 'cover', sort: 7 }),
        );
        prisma.siteArticleMedia.update.mockResolvedValue(
            linkRow({ role: 'cover', slot: 'cover' }),
        );
        await repository.putSlot(
            input({ role: 'cover', slot: 'cover', mediaId: 'm2' }),
        );
        expect(prisma.siteArticleMedia.findFirst).toHaveBeenCalledWith({
            where: { articleId: 'a1', role: 'cover', slot: 'cover' },
        });
        const [args] = prisma.siteArticleMedia.update.mock.calls[0] as [
            { data: Record<string, unknown> },
        ];
        expect(args.data).toMatchObject({ mediaId: 'm2', sort: 7 });
        expect(prisma.siteArticleMedia.create).not.toHaveBeenCalled();
    });

    it('новое в галерее — в конец: наибольший порядок + 10', async () => {
        prisma.siteArticleMedia.findFirst.mockResolvedValue(null);
        prisma.siteArticleMedia.aggregate.mockResolvedValue({
            _max: { sort: 30 },
        });
        prisma.siteArticleMedia.create.mockResolvedValue(linkRow({ sort: 40 }));
        const link = await repository.putGallery(input());
        const [args] = prisma.siteArticleMedia.create.mock.calls[0] as [
            { data: Record<string, unknown> },
        ];
        expect(args.data).toMatchObject({
            sort: 40,
            role: 'gallery',
            slot: null,
        });
        expect(link.media).toMatchObject({ id: 'm1', usageCount: 1 });
    });

    it('гонка за место (P2002) — 409; медиа или статью удалили (P2003) — 404', async () => {
        prisma.siteArticleMedia.findFirst.mockResolvedValue(null);
        prisma.siteArticleMedia.create.mockRejectedValueOnce(
            prismaError('P2002'),
        );
        await expect(
            repository.putSlot(input({ role: 'inline', slot: 'scr-a' })),
        ).rejects.toThrow(SITE_ARTICLE_MESSAGES.slotTaken);
        prisma.siteArticleMedia.create.mockRejectedValueOnce(
            prismaError('P2003'),
        );
        await expect(
            repository.putSlot(input({ role: 'inline', slot: 'scr-a' })),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('порядок галереи: ровно её связи, иначе 409 и без записи', async () => {
        prisma.siteArticleMedia.findMany
            .mockResolvedValueOnce([{ id: 'l1' }, { id: 'l2' }])
            .mockResolvedValueOnce([
                linkRow({ id: 'l2' }),
                linkRow({ id: 'l1' }),
            ]);
        await repository.reorderGallery('a1', ['l2', 'l1']);
        expect(
            prisma.siteArticleMedia.update.mock.calls.map(
                ([args]) => args as unknown,
            ),
        ).toEqual([
            {
                where: { id: 'l2' },
                data: { sort: 10, updatedAt: expect.any(Date) as Date },
            },
            {
                where: { id: 'l1' },
                data: { sort: 20, updatedAt: expect.any(Date) as Date },
            },
        ]);
        prisma.siteArticleMedia.update.mockClear();
        prisma.siteArticleMedia.findMany.mockResolvedValueOnce([
            { id: 'l1' },
            { id: 'l2' },
        ]);
        await expect(
            repository.reorderGallery('a1', ['l1', 'l3']),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.siteArticleMedia.update).not.toHaveBeenCalled();
    });

    it('отвязать чужую или исчезнувшую связь — 404', async () => {
        prisma.siteArticleMedia.deleteMany.mockResolvedValue({ count: 0 });
        await expect(repository.remove('a1', 'l9')).rejects.toThrow(
            SITE_ARTICLE_MESSAGES.linkNotFound,
        );
        expect(prisma.siteArticleMedia.deleteMany).toHaveBeenCalledWith({
            where: { id: 'l9', articleId: 'a1' },
        });
    });

    it('обложки без статей — без запроса; связь с неизвестной ролью пропускается', async () => {
        await expect(repository.coversOf([])).resolves.toEqual([]);
        expect(prisma.siteArticleMedia.findMany).not.toHaveBeenCalled();
        prisma.siteArticleMedia.findMany.mockResolvedValue([
            linkRow(),
            linkRow({ id: 'l2', role: 'hero' }),
        ]);
        const links = await repository.listByArticle('a1');
        expect(links.map(link => link.id)).toEqual(['l1']);
    });
});
