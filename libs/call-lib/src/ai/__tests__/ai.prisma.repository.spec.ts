import { AiPrismaRepository } from '../repository/ai.prisma.repository';

const DOMAIN = 'test.bitrix24.ru';
const TYPE = 'ai-analytics-manager-week';

interface WhereArg {
    domain: string;
    type: string;
    activity_id?: { in: string[] };
    transcription_id?: { in: bigint[] };
    entity_id?: { in: number[] };
}

/** Минимальная строка ais для createAiEntityFromPrisma. */
function makeRow(id: number, overrides: Record<string, unknown> = {}) {
    return {
        id: BigInt(id),
        created_at: null,
        updated_at: null,
        provider: 'ai-analytics',
        activity_id: null,
        file_id: null,
        in_comment: false,
        in_report: false,
        report_item_id: null,
        status: 'done',
        result: null,
        symbols_count: null,
        tokens_count: null,
        price: null,
        domain: DOMAIN,
        user_id: 7,
        user_name: null,
        entity_type: null,
        entity_id: null,
        entity_name: null,
        user_result: null,
        report_result: null,
        user_comment: null,
        owner_comment: null,
        user_mark: null,
        owner_mark: null,
        app: 'ai-analytics',
        department: null,
        type: TYPE,
        model: null,
        portal_id: null,
        transcription_id: null,
        ...overrides,
    };
}

function whereOf(findMany: jest.Mock, callIndex: number): WhereArg {
    const call = findMany.mock.calls[callIndex] as [{ where: WhereArg }];
    return call[0].where;
}

function makeRepo() {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { ai: { findMany } };
    const repo = new AiPrismaRepository(prisma as never);
    return { repo, findMany };
}

describe('AiPrismaRepository.findByDomainTypeKeys', () => {
    it('без ключей в БД не ходит и отдаёт пустой массив', async () => {
        const { repo, findMany } = makeRepo();

        await expect(
            repo.findByDomainTypeKeys(DOMAIN, TYPE, {}),
        ).resolves.toEqual([]);
        await expect(
            repo.findByDomainTypeKeys(DOMAIN, TYPE, { activityIds: [] }),
        ).resolves.toEqual([]);
        expect(findMany).not.toHaveBeenCalled();
    });

    it('режет набор ключей порциями по 500 и фильтрует по domain + type (без окна created_at)', async () => {
        const { repo, findMany } = makeRepo();
        const activityIds = Array.from({ length: 1200 }, (_, i) => `k${i}`);

        await repo.findByDomainTypeKeys(DOMAIN, TYPE, { activityIds });

        expect(findMany).toHaveBeenCalledTimes(3);
        expect(whereOf(findMany, 0).activity_id?.in).toHaveLength(500);
        expect(whereOf(findMany, 1).activity_id?.in).toHaveLength(500);
        expect(whereOf(findMany, 2).activity_id?.in).toHaveLength(200);
        const where = whereOf(findMany, 0);
        expect(where.domain).toBe(DOMAIN);
        expect(where.type).toBe(TYPE);
        expect(where).not.toHaveProperty('created_at');
    });

    it('transcription_id уходит в БД как BigInt, entity_id — числом', async () => {
        const { repo, findMany } = makeRepo();

        await repo.findByDomainTypeKeys(DOMAIN, TYPE, {
            transcriptionIds: ['42', '7'],
            entityIds: [500],
        });

        expect(findMany).toHaveBeenCalledTimes(2);
        expect(whereOf(findMany, 0).transcription_id).toEqual({
            in: [BigInt(42), BigInt(7)],
        });
        expect(whereOf(findMany, 1).entity_id).toEqual({ in: [500] });
    });

    it('объединяет наборы по ИЛИ, схлопывает дубли по id и сортирует по id', async () => {
        const { repo, findMany } = makeRepo();
        findMany
            .mockResolvedValueOnce([
                makeRow(20, { activity_id: '2026-09', entity_id: 500 }),
                makeRow(5, { activity_id: '2026-08' }),
            ])
            .mockResolvedValueOnce([
                makeRow(20, { activity_id: '2026-09', entity_id: 500 }),
                makeRow(11, { entity_id: 501 }),
            ]);

        const result = await repo.findByDomainTypeKeys(DOMAIN, TYPE, {
            activityIds: ['2026-09', '2026-08'],
            entityIds: [500, 501],
        });

        expect(result.map(e => e.id)).toEqual(['5', '11', '20']);
        expect(result[2].entity_id).toBe(500);
        expect(result[2].activity_id).toBe('2026-09');
    });

    it('latestOnly: на каждый ключ остаётся запись с максимальным id (по всем порциям)', async () => {
        const { repo, findMany } = makeRepo();
        const activityIds = Array.from({ length: 501 }, (_, i) => `k${i}`);
        findMany
            .mockResolvedValueOnce([
                makeRow(1, { activity_id: 'k0' }),
                makeRow(3, { activity_id: 'k0' }),
                makeRow(2, { activity_id: 'k1' }),
            ])
            .mockResolvedValueOnce([makeRow(9, { activity_id: 'k500' })]);

        const result = await repo.findByDomainTypeKeys(
            DOMAIN,
            TYPE,
            { activityIds },
            { latestOnly: true },
        );

        expect(result.map(e => e.id)).toEqual(['2', '3', '9']);
    });

    it('ошибка prisma не роняет вызывающего — пустой массив', async () => {
        const { repo, findMany } = makeRepo();
        findMany.mockRejectedValueOnce(new Error('db down'));
        const consoleError = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        await expect(
            repo.findByDomainTypeKeys(DOMAIN, TYPE, { activityIds: ['x'] }),
        ).resolves.toEqual([]);

        consoleError.mockRestore();
    });
});
