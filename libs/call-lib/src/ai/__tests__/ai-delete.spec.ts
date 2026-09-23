import { AiPrismaRepository } from '../repository/ai.prisma.repository';
import { AiService } from '../services/ai.service';
import { AI_RECORD_KEYS_CHUNK_SIZE } from '../lib/ai-record-keys.util';

/**
 * Физическое удаление записей `ais` по id — основа ретенции снапшотов
 * (админ-ручка `retention/run`): порции, отбрасывание нечисловых id,
 * счёт удалённых строк и мягкое поведение при ошибке базы.
 */
interface DeleteManyArgs {
    where: { id: { in: bigint[] } };
}

function makeRepository(counts: readonly number[]): {
    repository: AiPrismaRepository;
    deleteMany: jest.Mock<Promise<{ count: number }>, [DeleteManyArgs]>;
} {
    let call = 0;
    const deleteMany = jest.fn((args: DeleteManyArgs) => {
        void args;
        const count = counts[call] ?? 0;
        call += 1;
        return Promise.resolve({ count });
    });
    const prisma = { ai: { deleteMany } };
    return {
        repository: new AiPrismaRepository(prisma as never),
        deleteMany,
    };
}

describe('AiPrismaRepository.deleteByIds', () => {
    it('удаляет по id и возвращает число удалённых строк', async () => {
        const { repository, deleteMany } = makeRepository([2]);

        await expect(repository.deleteByIds(['10', '11'])).resolves.toBe(2);
        expect(deleteMany).toHaveBeenCalledTimes(1);
        expect(deleteMany.mock.calls[0][0]).toEqual({
            where: { id: { in: [BigInt(10), BigInt(11)] } },
        });
    });

    it('повторы схлопываются, нечисловые id отбрасываются, пустой список — без запроса', async () => {
        const { repository, deleteMany } = makeRepository([1]);

        await expect(
            repository.deleteByIds(['7', '7', 'abc', '']),
        ).resolves.toBe(1);
        expect(deleteMany.mock.calls[0][0]).toEqual({
            where: { id: { in: [BigInt(7)] } },
        });

        const empty = makeRepository([]);
        await expect(empty.repository.deleteByIds(['abc'])).resolves.toBe(0);
        expect(empty.deleteMany).not.toHaveBeenCalled();
    });

    it('длинный список режется на порции, счётчики складываются', async () => {
        const ids = Array.from(
            { length: AI_RECORD_KEYS_CHUNK_SIZE + 3 },
            (_, index) => String(index + 1),
        );
        const { repository, deleteMany } = makeRepository([
            AI_RECORD_KEYS_CHUNK_SIZE,
            3,
        ]);

        await expect(repository.deleteByIds(ids)).resolves.toBe(
            AI_RECORD_KEYS_CHUNK_SIZE + 3,
        );
        expect(deleteMany).toHaveBeenCalledTimes(2);
        expect(deleteMany.mock.calls[1][0].where.id.in).toHaveLength(3);
    });

    it('ошибка базы не бросается наружу: возвращается удалённое до сбоя', async () => {
        const deleteMany = jest
            .fn()
            .mockResolvedValueOnce({ count: 4 })
            .mockRejectedValueOnce(new Error('база недоступна'));
        const repository = new AiPrismaRepository({
            ai: { deleteMany },
        } as never);
        const ids = Array.from(
            { length: AI_RECORD_KEYS_CHUNK_SIZE + 1 },
            (_, index) => String(index + 1),
        );

        await expect(repository.deleteByIds(ids)).resolves.toBe(4);
    });
});

describe('AiService.deleteByIds', () => {
    it('делегирует репозиторию как есть', async () => {
        const deleteByIds = jest.fn().mockResolvedValue(3);
        const service = new AiService({ deleteByIds } as never);

        await expect(service.deleteByIds(['1', '2', '3'])).resolves.toBe(3);
        expect(deleteByIds).toHaveBeenCalledWith(['1', '2', '3']);
    });
});
