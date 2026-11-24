import { rq_counter } from 'generated/prisma';
import { PrismaService } from 'src/core/prisma';
import { CounterNumberService } from './counter-number.service';
import { CounterPrismaRepository } from '../repository/counter.prisma.repository';
import { CounterType } from '../lib/counter-type.enum';

/**
 * Сквозная проверка согласованности preview и next: настоящий
 * CounterPrismaRepository (инкремент в транзакции) на подмене Prisma,
 * которая хранит одну строку rq_counter в памяти. Так видно, что обе ручки
 * считают шаг одним правилом и что preview ничего не пишет.
 */

interface UpdateArgs {
    where: unknown;
    data: { count: number };
}

interface FakeRqCounterDelegate {
    findFirst: jest.Mock<Promise<rq_counter | null>, []>;
    findUniqueOrThrow: jest.Mock<Promise<{ count: number }>, []>;
    update: jest.Mock<Promise<rq_counter>, [UpdateArgs]>;
}

interface FakePrisma {
    rq_counter: FakeRqCounterDelegate;
    $transaction: jest.Mock<
        Promise<number>,
        [(tx: FakePrisma) => Promise<number>]
    >;
}

const buildRow = (overrides: Partial<rq_counter> = {}): rq_counter => ({
    rq_id: 1n,
    counter_id: 2n,
    type: CounterType.OFFER,
    value: null,
    prefix: 'INV',
    postfix: null,
    day: false,
    year: false,
    month: false,
    count: 5,
    size: 1,
    ...overrides,
});

const buildFakePrisma = (row: rq_counter): FakePrisma => {
    const prisma: FakePrisma = {
        rq_counter: {
            findFirst: jest.fn(() => Promise.resolve({ ...row })),
            findUniqueOrThrow: jest.fn(() =>
                Promise.resolve({ count: row.count }),
            ),
            update: jest.fn((args: UpdateArgs) => {
                row.count = args.data.count;
                return Promise.resolve({ ...row });
            }),
        },
        $transaction: jest.fn(callback => callback(prisma)),
    };
    return prisma;
};

describe('CounterNumberService — preview и next на одном правиле шага', () => {
    const build = (row: rq_counter) => {
        const prisma = buildFakePrisma(row);
        const repo = new CounterPrismaRepository(
            prisma as unknown as PrismaService,
        );
        return { prisma, service: new CounterNumberService(repo) };
    };

    it('два preview подряд одинаковы и не меняют счётчик', async () => {
        const row = buildRow({ count: 5, size: 1 });
        const { prisma, service } = build(row);

        const first = await service.previewNextNumber(1, CounterType.OFFER);
        const second = await service.previewNextNumber(1, CounterType.OFFER);

        expect(first).toBe('INV-6');
        expect(second).toBe(first);
        expect(row.count).toBe(5);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.rq_counter.update).not.toHaveBeenCalled();
    });

    it('preview, затем next дают один и тот же номер', async () => {
        const row = buildRow({ count: 5, size: 1 });
        const { service } = build(row);

        const preview = await service.previewNextNumber(1, CounterType.OFFER);
        const next = await service.getNextNumber(1, CounterType.OFFER);

        expect(preview).toBe('INV-6');
        expect(next).toBe(preview);
        expect(row.count).toBe(6);
    });

    it('после next preview показывает уже следующее значение', async () => {
        const row = buildRow({ count: 5, size: 1 });
        const { service } = build(row);

        await service.getNextNumber(1, CounterType.OFFER);
        const preview = await service.previewNextNumber(1, CounterType.OFFER);
        const next = await service.getNextNumber(1, CounterType.OFFER);

        expect(preview).toBe('INV-7');
        expect(next).toBe(preview);
    });

    it('шаг size больше единицы учитывается одинаково', async () => {
        const row = buildRow({ count: 10, size: 5 });
        const { service } = build(row);

        const preview = await service.previewNextNumber(1, CounterType.OFFER);
        const next = await service.getNextNumber(1, CounterType.OFFER);

        expect(preview).toBe('INV-15');
        expect(next).toBe(preview);
        expect(row.count).toBe(15);
    });

    it('если номер успел взять другой документ, next выдаст большее число', async () => {
        const row = buildRow({ count: 5, size: 1 });
        const { service } = build(row);

        const preview = await service.previewNextNumber(1, CounterType.OFFER);
        // Между просмотром и формированием номер взял другой документ.
        await service.getNextNumber(1, CounterType.OFFER);
        const next = await service.getNextNumber(1, CounterType.OFFER);

        expect(preview).toBe('INV-6');
        expect(next).toBe('INV-7');
    });

    it('без связи rq_counter отдаёт fallback и ничего не пишет', async () => {
        const row = buildRow();
        const { prisma, service } = build(row);
        prisma.rq_counter.findFirst.mockResolvedValue(null);

        const result = await service.previewNextNumber(9, CounterType.INVOICE);

        expect(result.startsWith('9')).toBe(true);
        expect(prisma.rq_counter.update).not.toHaveBeenCalled();
        expect(row.count).toBe(5);
    });
});
