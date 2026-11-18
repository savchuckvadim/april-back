import {
    ConflictException,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, type SiteMedia } from 'generated/prisma';
import {
    SITE_CONTENT_TABLES_MISSING_MESSAGE,
    SiteContentTablesMissingException,
} from '../../shared/site-content-prisma.errors';
import { toSiteMediaRecord } from '../site-media-library.mapper';
import {
    buildListWhere,
    SiteMediaLibraryPrismaRepository,
} from '../site-media-library.prisma.repository';

const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError(`prisma ${code}`, {
        code,
        clientVersion: 'test',
    });

const row = (over: Partial<SiteMedia> = {}): SiteMedia => ({
    id: 'm1',
    createdAt: new Date('2026-11-18T10:00:00Z'),
    updatedAt: new Date('2026-11-18T10:00:00Z'),
    kind: 'image',
    title: null,
    caption: null,
    alt: null,
    fileName: 'm1.0123456789ab.png',
    darkFileName: null,
    posterFileName: null,
    mime: 'image/png',
    sizeBytes: 10,
    width: 4,
    height: 3,
    durationSec: null,
    embedProvider: null,
    embedUrl: null,
    embedId: null,
    uploadedBy: null,
    ...over,
});

const createPrisma = () => ({
    siteMedia: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
    },
    siteArticleMedia: { findMany: jest.fn() },
});

describe('SiteMediaLibraryPrismaRepository', () => {
    let prisma: ReturnType<typeof createPrisma>;
    let repository: SiteMediaLibraryPrismaRepository;

    beforeEach(() => {
        prisma = createPrisma();
        repository = new SiteMediaLibraryPrismaRepository(prisma as never);
    });

    it('вставка ставит created_at и updated_at сама (поля camelCase)', async () => {
        prisma.siteMedia.create.mockResolvedValue(row());
        const { createdAt, updatedAt, usageCount, ...input } =
            toSiteMediaRecord(row());
        void createdAt;
        void updatedAt;
        void usageCount;
        await repository.create(input);
        const [{ data }] = prisma.siteMedia.create.mock.calls[0] as [
            { data: { createdAt: Date; updatedAt: Date } },
        ];
        expect(data.createdAt).toBeInstanceOf(Date);
        expect(data.updatedAt).toBe(data.createdAt);
    });

    it('таблицы нет — 503 «миграция не применена»', async () => {
        prisma.siteMedia.findUnique.mockRejectedValue(prismaError('P2021'));
        const call = repository.findById('m1');
        await expect(call).rejects.toBeInstanceOf(
            SiteContentTablesMissingException,
        );
        await expect(call).rejects.toBeInstanceOf(ServiceUnavailableException);
        await expect(call).rejects.toThrow(SITE_CONTENT_TABLES_MISSING_MESSAGE);
    });

    it('правка исчезнувшей строки — 404', async () => {
        prisma.siteMedia.update.mockRejectedValue(prismaError('P2025'));
        await expect(repository.update('m1', {})).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('удаление: внешний ключ (медиа успели поставить в статью) — 409, нет строки — 404', async () => {
        prisma.siteMedia.delete.mockRejectedValueOnce(prismaError('P2003'));
        await expect(repository.remove('m1')).rejects.toBeInstanceOf(
            ConflictException,
        );
        prisma.siteMedia.delete.mockRejectedValueOnce(prismaError('P2025'));
        await expect(repository.remove('m1')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('прочие ошибки базы не подменяются', async () => {
        const boom = new Error('connection lost');
        prisma.siteMedia.findUnique.mockRejectedValue(boom);
        await expect(repository.findById('m1')).rejects.toBe(boom);
    });

    it('список: фильтр, страница и счётчик использований', async () => {
        prisma.siteMedia.count.mockResolvedValue(7);
        prisma.siteMedia.findMany.mockResolvedValue([
            { ...row(), _count: { usages: 2 } },
        ]);
        const page = await repository.list({
            kind: 'image',
            unused: true,
            search: ' пульс ',
            page: 3,
            pageSize: 2,
        });
        expect(page).toMatchObject({ total: 7, page: 3, pageSize: 2 });
        expect(page.items[0].usageCount).toBe(2);
        const [args] = prisma.siteMedia.findMany.mock.calls[0] as [
            { skip: number; take: number },
        ];
        expect(args).toMatchObject({ skip: 4, take: 2 });
    });

    it('условие списка: вид, «не используется», поиск по трём полям', () => {
        expect(buildListWhere({ page: 1, pageSize: 1 })).toEqual({});
        expect(
            buildListWhere({
                kind: 'video',
                unused: true,
                search: 'x',
                page: 1,
                pageSize: 1,
            }),
        ).toEqual({
            kind: 'video',
            usages: { none: {} },
            OR: [
                { title: { contains: 'x' } },
                { caption: { contains: 'x' } },
                { alt: { contains: 'x' } },
            ],
        });
        expect(buildListWhere({ search: '  ', page: 1, pageSize: 1 })).toEqual(
            {},
        );
    });

    it('где используется: заголовок опубликованной версии, иначе последней, иначе null', async () => {
        const article = (published: string | null, latest: string | null) => ({
            id: 'a',
            section: 'ai',
            slug: 'index',
            publishedRevision: published ? { title: published } : null,
            revisions: latest ? [{ title: latest }] : [],
        });
        prisma.siteArticleMedia.findMany.mockResolvedValue([
            {
                role: 'cover',
                slot: 'cover',
                article: article('Опубл.', 'Черн.'),
            },
            { role: 'inline', slot: 's', article: article(null, 'Черн.') },
            { role: 'gallery', slot: null, article: article(null, null) },
        ]);
        const usages = await repository.usage('m1');
        expect(usages.map(usage => usage.title)).toEqual([
            'Опубл.',
            'Черн.',
            null,
        ]);
    });

    it('строка с неизвестным видом и поставщиком читается безопасно', () => {
        expect(
            toSiteMediaRecord(row({ kind: 'gif', embedProvider: 'tiktok' })),
        ).toMatchObject({ kind: 'image', embedProvider: null });
        expect(
            toSiteMediaRecord(row({ kind: '???', fileName: null })).kind,
        ).toBe('embed');
    });
});
