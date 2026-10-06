import { RedisService } from '@/core/redis/redis.service';
import {
    RESPONSIBLE_CACHE_TTL_SEC,
    ResponsibleService,
    responsibleCacheKey,
} from '../responsible.service';

/**
 * Кэш сотрудников: ФИО и руководитель спрашиваются на каждое открытие
 * связей клиента. Без кэша это до пяти пачек в портал подряд (разбор
 * нагрузки 05.10.2026), с кэшем — ни одной при повторе в пределах часа.
 */

const DOMAIN = 'portal.bitrix24.ru';

type Row = Record<string, unknown>;
type BitrixArg = Parameters<ResponsibleService['resolve']>[0];

const USERS: Record<number, Row> = {
    5: { ID: '5', NAME: 'Иван', LAST_NAME: 'Иванов', UF_DEPARTMENT: [10] },
    6: { ID: '6', NAME: 'Пётр', LAST_NAME: 'Петров', UF_DEPARTMENT: [10] },
    9: { ID: '9', NAME: 'Анна', LAST_NAME: 'Руководова', UF_DEPARTMENT: [1] },
};
const DEPARTMENTS: Record<number, Row> = {
    10: { ID: '10', UF_HEAD: '9', PARENT: '1' },
    1: { ID: '1', UF_HEAD: '9' },
};

/** Портал-заглушка: считает пачки и отвечает по добавленным командам. */
const makeBitrix = () => {
    let commands: Array<{ cmd: string; method: string; id: number }> = [];
    const batches: string[][] = [];
    const api = {
        domain: DOMAIN,
        addCmdBatch: (cmd: string, method: string, query: { ID: number }) => {
            commands.push({ cmd, method, id: Number(query.ID) });
        },
        callBatchAsync: () => {
            const result: Record<string, unknown> = {};
            for (const { cmd, method, id } of commands) {
                result[cmd] =
                    method === 'user.get'
                        ? [USERS[id]].filter(Boolean)
                        : [DEPARTMENTS[id]].filter(Boolean);
            }
            batches.push(commands.map(command => command.cmd));
            commands = [];
            return Promise.resolve([{ result }]);
        },
    };
    return { bitrix: { api } as unknown as BitrixArg, batches };
};

/** Redis-заглушка: обычная Map с журналом записей и их сроков. */
const makeRedis = () => {
    const store = new Map<string, string>();
    const ttls = new Map<string, number>();
    const client = {
        mget: (keys: string[]) =>
            Promise.resolve(keys.map(key => store.get(key) ?? null)),
        pipeline: () => {
            const pending: Array<() => void> = [];
            const pipeline = {
                set: (
                    key: string,
                    value: string,
                    _mode: string,
                    ttl: number,
                ) => {
                    pending.push(() => {
                        store.set(key, value);
                        ttls.set(key, ttl);
                    });
                    return pipeline;
                },
                exec: () => {
                    pending.forEach(apply => apply());
                    return Promise.resolve([]);
                },
            };
            return pipeline;
        },
    };
    const redis = { getClient: () => client } as unknown as RedisService;
    return { redis, store, ttls, client };
};

describe('ResponsibleService: кэш сотрудников', () => {
    it('первый запрос читает портал и кладёт сотрудников в кэш на час', async () => {
        const { redis, store, ttls } = makeRedis();
        const { bitrix, batches } = makeBitrix();
        const service = new ResponsibleService(redis);

        const people = await service.resolve(bitrix, [5, 6]);

        expect(people.get(5)).toEqual({
            id: 5,
            name: 'Иванов Иван',
            position: undefined,
            head: { id: 9, name: 'Руководова Анна' },
        });
        expect(batches.length).toBeGreaterThan(0);
        expect(store.has(responsibleCacheKey(DOMAIN, 5))).toBe(true);
        expect(store.has(responsibleCacheKey(DOMAIN, 6))).toBe(true);
        expect(ttls.get(responsibleCacheKey(DOMAIN, 5))).toBe(
            RESPONSIBLE_CACHE_TTL_SEC,
        );
    });

    it('повторный запрос тех же сотрудников в портал не ходит', async () => {
        const { redis } = makeRedis();
        const first = makeBitrix();
        const second = makeBitrix();
        const service = new ResponsibleService(redis);
        await service.resolve(first.bitrix, [5, 6]);

        const people = await service.resolve(second.bitrix, [6, 5]);

        expect(second.batches).toEqual([]);
        expect(people.get(6)?.name).toBe('Петров Пётр');
        expect(people.get(5)?.head).toEqual({ id: 9, name: 'Руководова Анна' });
    });

    it('в портал идут только те, кого нет в кэше', async () => {
        const { redis } = makeRedis();
        const first = makeBitrix();
        const second = makeBitrix();
        const service = new ResponsibleService(redis);
        await service.resolve(first.bitrix, [5]);

        const people = await service.resolve(second.bitrix, [5, 6]);

        // Первая пачка второго запроса — только недостающий сотрудник.
        expect(second.batches[0]).toEqual(['u6']);
        expect([...people.keys()].sort()).toEqual([5, 6]);
    });

    it('у каждого портала свой кэш', async () => {
        const { redis, store } = makeRedis();
        const { bitrix } = makeBitrix();
        const service = new ResponsibleService(redis);

        await service.resolve(bitrix, [5]);

        expect(store.has(responsibleCacheKey('other.bitrix24.ru', 5))).toBe(
            false,
        );
    });

    it('сбой Redis не ломает ответ — сотрудники читаются из портала', async () => {
        const { redis, client } = makeRedis();
        client.mget = () => Promise.reject(new Error('redis down'));
        const { bitrix, batches } = makeBitrix();
        const service = new ResponsibleService(redis);
        jest.spyOn(service['logger'], 'warn').mockImplementation(
            () => undefined,
        );

        const people = await service.resolve(bitrix, [5]);

        expect(people.get(5)?.name).toBe('Иванов Иван');
        expect(batches.length).toBeGreaterThan(0);
    });

    it('без Redis работает как раньше — каждый раз из портала', async () => {
        const first = makeBitrix();
        const second = makeBitrix();
        const service = new ResponsibleService();

        await service.resolve(first.bitrix, [5]);
        await service.resolve(second.bitrix, [5]);

        expect(second.batches.length).toBeGreaterThan(0);
    });

    it('пустой и мусорный список — ни кэша, ни портала', async () => {
        const { redis } = makeRedis();
        const { bitrix, batches } = makeBitrix();
        const service = new ResponsibleService(redis);

        const people = await service.resolve(bitrix, [0, Number.NaN, -3]);

        expect(people.size).toBe(0);
        expect(batches).toEqual([]);
    });
});
