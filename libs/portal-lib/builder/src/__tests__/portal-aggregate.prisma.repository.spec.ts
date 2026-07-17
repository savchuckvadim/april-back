import { PortalAggregatePrismaRepository } from '../repositories/portal-aggregate.prisma.repository';
import { PrismaService } from '@lib/core/prisma';
import { categoryRow, dealRow, fieldRow, listRow, portalRow } from './fixtures';

type PrismaMock = {
    portal: { findFirst: jest.Mock };
    bitrixfields: { findMany: jest.Mock };
    btx_categories: { findMany: jest.Mock };
};

type FindManyArgs = { where: { OR: unknown[] } };

const findManyArgs = (mock: jest.Mock): FindManyArgs => {
    const calls = mock.mock.calls as [FindManyArgs][];
    return calls[0][0];
};

const createPrismaMock = (): PrismaMock => ({
    portal: { findFirst: jest.fn() },
    bitrixfields: { findMany: jest.fn().mockResolvedValue([]) },
    btx_categories: { findMany: jest.fn().mockResolvedValue([]) },
});

describe('PortalAggregatePrismaRepository', () => {
    let prisma: PrismaMock;
    let repository: PortalAggregatePrismaRepository;

    beforeEach(() => {
        prisma = createPrismaMock();
        repository = new PortalAggregatePrismaRepository(
            prisma as unknown as PrismaService,
        );
    });

    it('возвращает null, если портал не найден', async () => {
        prisma.portal.findFirst.mockResolvedValue(null);

        await expect(
            repository.findByDomain('unknown.bitrix24.ru'),
        ).resolves.toBeNull();
        expect(prisma.bitrixfields.findMany).not.toHaveBeenCalled();
    });

    it('делает ровно 3 запроса: портал, поля, категории', async () => {
        prisma.portal.findFirst.mockResolvedValue(
            portalRow({ btx_deals: [dealRow()] }),
        );

        await repository.findByDomain('test.bitrix24.ru');

        expect(prisma.portal.findFirst).toHaveBeenCalledTimes(1);
        expect(prisma.bitrixfields.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.btx_categories.findMany).toHaveBeenCalledTimes(1);
    });

    it('не запрашивает полиморфные таблицы, если у портала нет сущностей', async () => {
        prisma.portal.findFirst.mockResolvedValue(portalRow());

        await repository.findByDomain('test.bitrix24.ru');

        expect(prisma.bitrixfields.findMany).not.toHaveBeenCalled();
        expect(prisma.btx_categories.findMany).not.toHaveBeenCalled();
    });

    it('строит OR-пары с обоими написаниями FQCN для списков', async () => {
        prisma.portal.findFirst.mockResolvedValue(
            portalRow({ bitrixlists: [listRow({ id: 6n })] }),
        );

        await repository.findByDomain('test.bitrix24.ru');

        const { where } = findManyArgs(prisma.bitrixfields.findMany);
        expect(where.OR).toEqual(
            expect.arrayContaining([
                {
                    entity_type: 'App\\Models\\BitrixList',
                    entity_id: { in: [6n] },
                },
                {
                    entity_type: 'App\\Models\\Bitrixlist',
                    entity_id: { in: [6n] },
                },
            ]),
        );
    });

    it('категории запрашивает только для deal/smart/rpa/lead (не для списков)', async () => {
        prisma.portal.findFirst.mockResolvedValue(
            portalRow({
                bitrixlists: [listRow()],
                btx_deals: [dealRow({ id: 3n })],
            }),
        );

        await repository.findByDomain('test.bitrix24.ru');

        const { where } = findManyArgs(prisma.btx_categories.findMany);
        expect(where.OR).toEqual([
            { entity_type: 'App\\Models\\BtxDeal', entity_id: { in: [3n] } },
        ]);
    });

    it('группирует строки в индексы по entity_type и entity_id', async () => {
        prisma.portal.findFirst.mockResolvedValue(
            portalRow({ btx_deals: [dealRow({ id: 3n })] }),
        );
        prisma.bitrixfields.findMany.mockResolvedValue([
            fieldRow({ entity_id: 3n }),
            fieldRow({ id: 6n, entity_id: 3n }),
        ]);
        prisma.btx_categories.findMany.mockResolvedValue([
            categoryRow({ entity_id: 3n }),
        ]);

        const aggregate = await repository.findByDomain('test.bitrix24.ru');

        expect(
            aggregate?.fieldsIndex.get('App\\Models\\BtxDeal')?.get(3),
        ).toHaveLength(2);
        expect(
            aggregate?.categoriesIndex.get('App\\Models\\BtxDeal')?.get(3),
        ).toHaveLength(1);
    });

    it('findById ищет портал по BigInt id', async () => {
        prisma.portal.findFirst.mockResolvedValue(portalRow());

        await repository.findById(1);

        expect(prisma.portal.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 1n } }),
        );
    });
});
