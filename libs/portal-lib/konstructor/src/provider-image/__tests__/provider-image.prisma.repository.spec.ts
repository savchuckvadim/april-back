import type { ProviderImage } from 'generated/prisma';
import { PrismaService } from 'src/core/prisma';
import { ProviderImagePrismaRepository } from '../provider-image.prisma.repository';

const makeRow = (over: Partial<ProviderImage> = {}): ProviderImage => ({
    id: '3f2a9c1e-7b4d-4e8a-9f60-1c2d3e4f5a6b',
    createdAt: new Date('2026-11-23T10:00:00Z'),
    updatedAt: new Date('2026-11-23T10:00:00Z'),
    rqId: BigInt(15),
    role: 'stamp',
    path: 'konstructor/provider-images/15/3f2a9c1e.png',
    format: 'png',
    width: 400,
    height: 400,
    size: 48213,
    originalName: 'pechat.png',
    legacyFileId: null,
    ...over,
});

type DelegateMock = Record<string, jest.Mock>;
interface PrismaMock {
    providerImage: DelegateMock;
    rqs: DelegateMock;
}

describe('ProviderImagePrismaRepository', () => {
    let prisma: PrismaMock;
    let repository: ProviderImagePrismaRepository;

    beforeEach(() => {
        prisma = {
            providerImage: {
                findMany: jest.fn(),
                findUnique: jest.fn(),
                upsert: jest.fn(),
                deleteMany: jest.fn(),
            },
            rqs: { count: jest.fn() },
        };
        repository = new ProviderImagePrismaRepository(
            prisma as unknown as PrismaService,
        );
    });

    describe('rqExists', () => {
        it('считает реквизиты по id, bigint наружу не выходит', async () => {
            prisma.rqs.count.mockResolvedValue(1);
            await expect(repository.rqExists(15)).resolves.toBe(true);
            expect(prisma.rqs.count).toHaveBeenCalledWith({
                where: { id: BigInt(15) },
            });

            prisma.rqs.count.mockResolvedValue(0);
            await expect(repository.rqExists(16)).resolves.toBe(false);
        });
    });

    describe('findByRq', () => {
        it('читает по реквизитам в порядке ролей и переводит rqId в число', async () => {
            prisma.providerImage.findMany.mockResolvedValue([
                makeRow({ role: 'logo', format: 'jpg' }),
                makeRow({ role: 'stamp' }),
            ]);

            const found = await repository.findByRq(15);

            expect(prisma.providerImage.findMany).toHaveBeenCalledWith({
                where: { rqId: BigInt(15) },
                orderBy: { role: 'asc' },
            });
            expect(found.map(image => image.role)).toEqual(['logo', 'stamp']);
            expect(found[0].rqId).toBe(15);
            expect(typeof found[0].rqId).toBe('number');
        });

        it('строки с неизвестной ролью или форматом пропускает', async () => {
            prisma.providerImage.findMany.mockResolvedValue([
                makeRow({ role: 'seal' }),
                makeRow({ role: 'logo', format: 'webp' }),
                makeRow({ role: 'signature_director' }),
            ]);

            const found = await repository.findByRq(15);

            expect(found.map(image => image.role)).toEqual([
                'signature_director',
            ]);
        });
    });

    describe('find', () => {
        it('ищет по составному ключу реквизитов и роли', async () => {
            prisma.providerImage.findUnique.mockResolvedValue(makeRow());

            const image = await repository.find(15, 'stamp');

            expect(prisma.providerImage.findUnique).toHaveBeenCalledWith({
                where: { rqId_role: { rqId: BigInt(15), role: 'stamp' } },
            });
            expect(image?.path).toContain('konstructor/provider-images/15/');
        });

        it('нет записи — null', async () => {
            prisma.providerImage.findUnique.mockResolvedValue(null);
            await expect(repository.find(15, 'logo')).resolves.toBeNull();
        });
    });

    describe('upsert', () => {
        const data = {
            id: 'new-uuid',
            rqId: 15,
            role: 'stamp' as const,
            path: 'konstructor/provider-images/15/new-uuid.png',
            format: 'png' as const,
            width: 400,
            height: 300,
            size: 1000,
            originalName: 'pechat.png',
        };

        it('создание и замена одной операцией по паре «реквизиты и роль»; даты ставит Nest', async () => {
            prisma.providerImage.upsert.mockResolvedValue(
                makeRow({ id: 'new-uuid' }),
            );

            await repository.upsert(data);

            const [args] = prisma.providerImage.upsert.mock.calls[0] as [
                {
                    where: unknown;
                    create: Record<string, unknown>;
                    update: Record<string, unknown>;
                },
            ];
            expect(args.where).toEqual({
                rqId_role: { rqId: BigInt(15), role: 'stamp' },
            });
            expect(args.create).toMatchObject({
                id: 'new-uuid',
                rqId: BigInt(15),
                role: 'stamp',
                path: data.path,
                legacyFileId: null,
            });
            expect(args.create.createdAt).toBeInstanceOf(Date);
            expect(args.create.updatedAt).toBeInstanceOf(Date);
            expect(args.update).toMatchObject({
                id: 'new-uuid',
                path: data.path,
                width: 400,
                height: 300,
                size: 1000,
            });
            expect(args.update.updatedAt).toBeInstanceOf(Date);
            expect(args.update).not.toHaveProperty('createdAt');
        });

        it('при замене связь с легаси-файлом остаётся, пока её явно не задали', async () => {
            prisma.providerImage.upsert.mockResolvedValue(makeRow());

            await repository.upsert(data);
            await repository.upsert({ ...data, legacyFileId: 77 });

            const calls = prisma.providerImage.upsert.mock.calls as Array<
                [{ update: Record<string, unknown> }]
            >;
            expect(calls[0][0].update).not.toHaveProperty('legacyFileId');
            expect(calls[1][0].update).toMatchObject({ legacyFileId: 77 });
        });
    });

    describe('delete', () => {
        it('true, когда запись была, и false, когда её не было', async () => {
            prisma.providerImage.deleteMany.mockResolvedValueOnce({ count: 1 });
            await expect(repository.delete(15, 'stamp')).resolves.toBe(true);
            expect(prisma.providerImage.deleteMany).toHaveBeenCalledWith({
                where: { rqId: BigInt(15), role: 'stamp' },
            });

            prisma.providerImage.deleteMany.mockResolvedValueOnce({ count: 0 });
            await expect(repository.delete(15, 'logo')).resolves.toBe(false);
        });
    });
});
