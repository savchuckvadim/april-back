import type { agents, rqs } from 'generated/prisma';
import { PrismaService } from 'src/core/prisma';
import { ProviderPrismaRepository } from './provider.prisma.repository';
import { CreateProviderWithRqInput } from './provider.entity';

function makeAgent(over: Partial<agents> = {}): agents {
    return {
        id: BigInt(5),
        created_at: null,
        updated_at: null,
        portalId: BigInt(1),
        rqId: null,
        type: 'organization',
        name: 'ООО «Ромашка»',
        code: 'romashka',
        number: '1',
        withTax: true,
        ...over,
    } as agents;
}

function makeRq(over: Partial<rqs> = {}): rqs {
    return {
        id: BigInt(9),
        type: 'organization',
        name: 'ООО «Ромашка»',
        inn: '7701234567',
        agentId: BigInt(5),
        ...over,
    } as rqs;
}

type DelegateMock = Record<string, jest.Mock>;
interface PrismaMock {
    agents: DelegateMock;
    rqs: DelegateMock;
    portal: DelegateMock;
    $transaction: jest.Mock;
}

describe('ProviderPrismaRepository', () => {
    let prisma: PrismaMock;
    let repository: ProviderPrismaRepository;

    beforeEach(() => {
        prisma = {
            agents: {
                findUnique: jest.fn(),
                findMany: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
            rqs: {
                findUnique: jest.fn(),
                findFirst: jest.fn(),
                findMany: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                deleteMany: jest.fn(),
            },
            portal: {
                findFirst: jest.fn(),
            },
            $transaction: jest.fn(),
        };
        // По умолчанию транзакция выполняет колбэк с тем же prisma-инстансом.
        prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
            cb(prisma),
        );
        repository = new ProviderPrismaRepository(
            prisma as unknown as PrismaService,
        );
    });

    describe('createWithRq', () => {
        const input: CreateProviderWithRqInput = {
            domain: 'company.bitrix24.ru',
            type: 'organization',
            name: 'ООО «Ромашка»',
            code: 'romashka',
            number: '1',
            withTax: true,
            rq: {
                type: 'organization',
                name: 'ООО «Ромашка»',
                inn: '7701234567',
            },
        };

        it('создаёт поставщика и реквизиты и связывает их', async () => {
            prisma.portal.findFirst.mockResolvedValue({
                id: BigInt(1),
            } as never);
            prisma.agents.create.mockResolvedValue(makeAgent());
            prisma.rqs.create.mockResolvedValue(makeRq());
            prisma.agents.update.mockResolvedValue(
                makeAgent({ rqId: BigInt(9) }),
            );

            const result = await repository.createWithRq(input);

            expect(prisma.agents.create).toHaveBeenCalledWith({
                data: {
                    portalId: BigInt(1),
                    type: 'organization',
                    name: 'ООО «Ромашка»',
                    code: 'romashka',
                    number: '1',
                    withTax: true,
                },
            });
            // Реквизиты привязаны к созданному поставщику.
            const createCalls = prisma.rqs.create.mock.calls as Array<
                [{ data: { type: string; agentId: bigint; inn?: string } }]
            >;
            const createArg = createCalls[0][0];
            expect(createArg.data.type).toBe('organization');
            expect(createArg.data.agentId).toBe(BigInt(5));
            expect(createArg.data.inn).toBe('7701234567');
            // Обратная связь agents.rqId -> rqs.id.
            expect(prisma.agents.update).toHaveBeenCalledWith({
                where: { id: BigInt(5) },
                data: { rqId: BigInt(9) },
            });
            expect(result.id).toBe('5');
            expect(result.rq.id).toBe(9);
            expect(result.rq.inn).toBe('7701234567');
        });

        it('бросает ошибку, если портал по домену не найден', async () => {
            prisma.portal.findFirst.mockResolvedValue(null as never);

            await expect(repository.createWithRq(input)).rejects.toThrow(
                'Portal not found',
            );
            expect(prisma.agents.create).not.toHaveBeenCalled();
        });
    });

    describe('updateRq', () => {
        it('обновляет существующие реквизиты и берёт withTax у поставщика', async () => {
            prisma.rqs.findUnique.mockResolvedValue(makeRq());
            prisma.rqs.update.mockResolvedValue(makeRq({ name: 'Новое имя' }));
            prisma.agents.findUnique.mockResolvedValue(
                makeAgent({ withTax: true }),
            );

            const result = await repository.updateRq(9, { name: 'Новое имя' });

            const updateCalls = prisma.rqs.update.mock.calls as Array<
                [{ where: { id: number }; data: { name?: string } }]
            >;
            const updateArg = updateCalls[0][0];
            expect(updateArg.where).toEqual({ id: 9 });
            expect(updateArg.data.name).toBe('Новое имя');
            expect(result?.name).toBe('Новое имя');
            expect(result?.withTax).toBe(true);
        });

        it('возвращает null, если реквизиты не найдены', async () => {
            prisma.rqs.findUnique.mockResolvedValue(null as never);

            const result = await repository.updateRq(999, { name: 'x' });

            expect(result).toBeNull();
            expect(prisma.rqs.update).not.toHaveBeenCalled();
        });
    });

    describe('delete', () => {
        it('удаляет поставщика и его реквизиты в транзакции', async () => {
            prisma.agents.findUnique.mockResolvedValue(makeAgent());
            prisma.agents.update.mockResolvedValue(makeAgent({ rqId: null }));
            prisma.rqs.deleteMany.mockResolvedValue({ count: 1 } as never);
            prisma.agents.delete.mockResolvedValue(makeAgent());

            const result = await repository.delete(5);

            expect(result).toBe(true);
            // Связь снимается до удаления реквизитов.
            expect(prisma.agents.update).toHaveBeenCalledWith({
                where: { id: BigInt(5) },
                data: { rqId: null },
            });
            expect(prisma.rqs.deleteMany).toHaveBeenCalledWith({
                where: { agentId: BigInt(5) },
            });
            expect(prisma.agents.delete).toHaveBeenCalledWith({
                where: { id: BigInt(5) },
            });
        });

        it('возвращает false, если поставщик не найден', async () => {
            prisma.agents.findUnique.mockResolvedValue(null as never);

            const result = await repository.delete(404);

            expect(result).toBe(false);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });
    });
});
