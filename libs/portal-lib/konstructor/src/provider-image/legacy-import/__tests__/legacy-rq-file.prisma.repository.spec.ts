import { PrismaService } from 'src/core/prisma';
import {
    LEGACY_RQ_ENTITY_TYPE,
    LEGACY_RQ_PARENT,
    LegacyRqFilePrismaRepository,
} from '../legacy-rq-file.prisma.repository';

type DelegateMock = Record<string, jest.Mock>;
interface PrismaMock {
    files: DelegateMock;
    rqs: DelegateMock;
    agents: DelegateMock;
    portal: DelegateMock;
}

const fileRow = (
    over: Partial<{
        id: bigint;
        entity_id: bigint | null;
        parent_type: string | null;
        code: string;
        path: string;
    }> = {},
) => ({
    id: BigInt(101),
    entity_id: BigInt(15),
    parent_type: 'stamp',
    code: 'stamp',
    path: 'clients/garant.test/rq/15/stamp/15_stamp_stamp_a.png',
    ...over,
});

describe('LegacyRqFilePrismaRepository', () => {
    let prisma: PrismaMock;
    let repository: LegacyRqFilePrismaRepository;

    beforeEach(() => {
        prisma = {
            files: { findMany: jest.fn() },
            rqs: { findMany: jest.fn() },
            agents: { findMany: jest.fn() },
            portal: { findMany: jest.fn() },
        };
        repository = new LegacyRqFilePrismaRepository(
            prisma as unknown as PrismaService,
        );
    });

    it('тип сущности в files — строка Laravel с обратными слэшами', () => {
        expect(LEGACY_RQ_ENTITY_TYPE).toBe('App\\Models\\Rq');
        expect(LEGACY_RQ_ENTITY_TYPE).toHaveLength(13);
        expect(LEGACY_RQ_PARENT).toBe('rq');
    });

    describe('findByPaths', () => {
        it('ищет по точным путям среди файлов реквизитов, bigint наружу не выходит', async () => {
            prisma.files.findMany.mockResolvedValue([fileRow()]);

            const result = await repository.findByPaths([
                'clients/garant.test/rq/15/stamp/15_stamp_stamp_a.png',
            ]);

            expect(prisma.files.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        entity_type: 'App\\Models\\Rq',
                        parent: 'rq',
                        path: {
                            in: [
                                'clients/garant.test/rq/15/stamp/15_stamp_stamp_a.png',
                            ],
                        },
                    },
                    orderBy: { id: 'asc' },
                }),
            );
            expect(result).toEqual([
                {
                    id: 101,
                    rqId: 15,
                    parentType: 'stamp',
                    code: 'stamp',
                    path: 'clients/garant.test/rq/15/stamp/15_stamp_stamp_a.png',
                },
            ]);
        });

        it('записи без entity_id отбрасываются, пустой список путей базу не трогает', async () => {
            prisma.files.findMany.mockResolvedValue([
                fileRow({ entity_id: null }),
            ]);
            await expect(repository.findByPaths(['a'])).resolves.toEqual([]);

            prisma.files.findMany.mockClear();
            await expect(repository.findByPaths([])).resolves.toEqual([]);
            expect(prisma.files.findMany).not.toHaveBeenCalled();
        });
    });

    describe('findByPathSuffixes', () => {
        it('ищет записи реквизитов, путь которых оканчивается на /суффикс', async () => {
            prisma.files.findMany.mockResolvedValue([fileRow()]);

            const result = await repository.findByPathSuffixes([
                '15_stamp_stamp_a.png',
                'rq/16/logo/b.png',
            ]);

            expect(prisma.files.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        entity_type: 'App\\Models\\Rq',
                        parent: 'rq',
                        OR: [
                            { path: { endsWith: '/15_stamp_stamp_a.png' } },
                            { path: { endsWith: '/rq/16/logo/b.png' } },
                        ],
                    },
                }),
            );
            expect(result.map(row => row.id)).toEqual([101]);
        });

        it('пустой список суффиксов базу не трогает', async () => {
            await expect(repository.findByPathSuffixes([])).resolves.toEqual(
                [],
            );
            expect(prisma.files.findMany).not.toHaveBeenCalled();
        });
    });

    describe('findByRqIds', () => {
        it('читает все записи реквизитов по entity_id', async () => {
            prisma.files.findMany.mockResolvedValue([
                fileRow(),
                fileRow({ id: BigInt(102), parent_type: null }),
            ]);

            const result = await repository.findByRqIds([15, 16]);

            expect(prisma.files.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        entity_type: 'App\\Models\\Rq',
                        parent: 'rq',
                        entity_id: { in: [BigInt(15), BigInt(16)] },
                    },
                }),
            );
            expect(result.map(row => [row.id, row.parentType])).toEqual([
                [101, 'stamp'],
                [102, null],
            ]);
        });

        it('пустой список реквизитов базу не трогает', async () => {
            await expect(repository.findByRqIds([])).resolves.toEqual([]);
            expect(prisma.files.findMany).not.toHaveBeenCalled();
        });
    });

    describe('findRqInfo', () => {
        it('имя реквизитов и домен портала через rq → agent → portal', async () => {
            prisma.rqs.findMany.mockResolvedValue([
                {
                    id: BigInt(15),
                    name: ' ООО Ромашка ',
                    shortname: null,
                    fullname: null,
                    agentId: BigInt(3),
                },
            ]);
            prisma.agents.findMany.mockResolvedValue([
                { id: BigInt(3), rqId: BigInt(15), portalId: BigInt(8) },
            ]);
            prisma.portal.findMany.mockResolvedValue([
                { id: BigInt(8), domain: 'garant.test' },
            ]);

            const result = await repository.findRqInfo([15]);

            expect(prisma.rqs.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: { in: [BigInt(15)] } },
                }),
            );
            expect(prisma.agents.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        OR: [
                            { id: { in: [BigInt(3)] } },
                            { rqId: { in: [BigInt(15)] } },
                        ],
                    },
                }),
            );
            expect(result).toEqual([
                {
                    rqId: 15,
                    rqName: 'ООО Ромашка',
                    portalDomain: 'garant.test',
                },
            ]);
        });

        it('поставщик находится и по agents.rqId, если у реквизитов нет agentId; имя берётся из shortname и fullname', async () => {
            prisma.rqs.findMany.mockResolvedValue([
                {
                    id: BigInt(15),
                    name: '',
                    shortname: 'Ромашка',
                    fullname: 'ООО Ромашка',
                    agentId: null,
                },
                {
                    id: BigInt(16),
                    name: null,
                    shortname: null,
                    fullname: 'ИП Иванов',
                    agentId: null,
                },
            ]);
            prisma.agents.findMany.mockResolvedValue([
                { id: BigInt(3), rqId: BigInt(15), portalId: BigInt(8) },
            ]);
            prisma.portal.findMany.mockResolvedValue([
                { id: BigInt(8), domain: 'garant.test' },
            ]);

            const result = await repository.findRqInfo([15, 16]);

            expect(result).toEqual([
                {
                    rqId: 15,
                    rqName: 'Ромашка',
                    portalDomain: 'garant.test',
                },
                { rqId: 16, rqName: 'ИП Иванов', portalDomain: null },
            ]);
        });

        it('реквизиты, которых нет в базе, в результат не попадают; пустой список базу не трогает', async () => {
            prisma.rqs.findMany.mockResolvedValue([]);
            prisma.agents.findMany.mockResolvedValue([]);
            prisma.portal.findMany.mockResolvedValue([]);
            await expect(repository.findRqInfo([404])).resolves.toEqual([]);

            prisma.rqs.findMany.mockClear();
            await expect(repository.findRqInfo([])).resolves.toEqual([]);
            expect(prisma.rqs.findMany).not.toHaveBeenCalled();
        });
    });
});
