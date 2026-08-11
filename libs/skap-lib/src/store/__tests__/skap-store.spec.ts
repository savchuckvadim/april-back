import { PrismaService } from '@lib/core';
import { SkapFileRepository } from '../skap-file.repository';
import { SkapItemRepository } from '../skap-item.repository';

describe('SkapFileRepository.syncDiskFiles', () => {
    const makePrisma = (known: unknown[]) => {
        const create = jest.fn().mockResolvedValue({});
        const update = jest.fn().mockResolvedValue({});
        const findMany = jest.fn().mockResolvedValue(known);
        const prisma = {
            skapImportFile: { findMany, create, update },
        } as unknown as PrismaService;
        return { prisma, create, update, findMany };
    };

    const diskFile = (id: string, updatedAt: Date | null, size: bigint) => ({
        diskFileId: id,
        fileName: `${id}.zip`,
        diskUpdatedAt: updatedAt,
        size,
    });

    it('новый файл создаётся в pending', async () => {
        const { prisma, create } = makePrisma([]);
        const repo = new SkapFileRepository(prisma);

        const result = await repo.syncDiskFiles(BigInt(1), 'x.bitrix24.ru', [
            diskFile('f1', new Date('2026-08-01'), BigInt(10)),
        ]);

        expect(result).toEqual({ added: 1, reset: 0, unchanged: 0 });
        const createArg = (create.mock.calls as unknown[][])[0][0];
        expect(createArg).toMatchObject({
            data: { diskFileId: 'f1', status: 'pending' },
        });
    });

    it('перезалитый файл (другой UPDATE_TIME) сбрасывается в pending', async () => {
        const { prisma, update } = makePrisma([
            {
                id: 'row1',
                diskFileId: 'f1',
                diskUpdatedAt: new Date('2026-08-01'),
                size: BigInt(10),
                status: 'done',
            },
        ]);
        const repo = new SkapFileRepository(prisma);

        const result = await repo.syncDiskFiles(BigInt(1), 'x.bitrix24.ru', [
            diskFile('f1', new Date('2026-08-05'), BigInt(10)),
        ]);

        expect(result).toEqual({ added: 0, reset: 1, unchanged: 0 });
        const updateArg = (update.mock.calls as unknown[][])[0][0];
        expect(updateArg).toMatchObject({
            where: { id: 'row1' },
            data: { status: 'pending' },
        });
    });

    it('не изменившийся файл не трогается', async () => {
        const { prisma, create, update } = makePrisma([
            {
                id: 'row1',
                diskFileId: 'f1',
                diskUpdatedAt: new Date('2026-08-01'),
                size: BigInt(10),
                status: 'done',
            },
        ]);
        const repo = new SkapFileRepository(prisma);

        const result = await repo.syncDiskFiles(BigInt(1), 'x.bitrix24.ru', [
            diskFile('f1', new Date('2026-08-01'), BigInt(10)),
        ]);

        expect(result).toEqual({ added: 0, reset: 0, unchanged: 1 });
        expect(create).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it('пустой листинг — пустой результат без запросов', async () => {
        const { prisma, findMany } = makePrisma([]);
        const repo = new SkapFileRepository(prisma);

        const result = await repo.syncDiskFiles(BigInt(1), 'x', []);

        expect(result).toEqual({ added: 0, reset: 0, unchanged: 0 });
        expect(findMany).not.toHaveBeenCalled();
    });
});

describe('SkapItemRepository.filterBusyDedupKeys', () => {
    it('занятыми считаются только created/updated', async () => {
        const findMany = jest
            .fn()
            .mockResolvedValue([{ dedupKey: 'a' }, { dedupKey: 'b' }]);
        const prisma = {
            skapImportItem: { findMany },
        } as unknown as PrismaService;
        const repo = new SkapItemRepository(prisma);

        const busy = await repo.filterBusyDedupKeys(['a', 'b', 'c']);

        expect(busy).toEqual(new Set(['a', 'b']));
        const findArg = (findMany.mock.calls as unknown[][])[0][0];
        expect(findArg).toMatchObject({
            where: { status: { in: ['created', 'updated'] } },
        });
    });

    it('пустой вход — пустой Set без запроса', async () => {
        const findMany = jest.fn();
        const prisma = {
            skapImportItem: { findMany },
        } as unknown as PrismaService;
        const repo = new SkapItemRepository(prisma);

        await expect(repo.filterBusyDedupKeys([])).resolves.toEqual(new Set());
        expect(findMany).not.toHaveBeenCalled();
    });
});
