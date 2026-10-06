import { RedisJsonCache } from '../redis-json-cache';
import { RedisService } from '../redis.service';

interface Row {
    id: number;
}

const isRow = (value: unknown): value is Row =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'number';

/** Redis в памяти: только то, чем пользуется кэш. */
const makeRedis = () => {
    const store = new Map<string, string>();
    const client = {
        get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        set: jest.fn((key: string, value: string) => {
            store.set(key, value);
            return Promise.resolve('OK');
        }),
        del: jest.fn((...keys: string[]) => {
            keys.forEach(key => store.delete(key));
            return Promise.resolve(keys.length);
        }),
    };
    const redis = { getClient: () => client } as unknown as RedisService;
    return { redis, client, store };
};

const makeCache = (redis: RedisService | undefined) =>
    new RedisJsonCache<Row>(redis, { name: 'test', ttlSec: 60, guard: isRow });

describe('RedisJsonCache', () => {
    it('возвращает записанное и пишет со сроком', async () => {
        const { redis, client } = makeRedis();
        const cache = makeCache(redis);

        await cache.set('k', { id: 7 });

        expect(await cache.get('k')).toEqual({ id: 7 });
        expect(client.set).toHaveBeenCalledWith('k', '{"id":7}', 'EX', 60);
    });

    it('записи нет — undefined', async () => {
        const { redis } = makeRedis();

        expect(await makeCache(redis).get('missing')).toBeUndefined();
    });

    it('запись не той формы или битая — как будто её нет', async () => {
        const { redis, store } = makeRedis();
        const cache = makeCache(redis);
        store.set('old', '{"name":"без id"}');
        store.set('broken', '{не json');

        expect(await cache.get('old')).toBeUndefined();
        expect(await cache.get('broken')).toBeUndefined();
    });

    it('сбой Redis не ломает основной путь', async () => {
        const { redis, client } = makeRedis();
        client.get.mockRejectedValue(new Error('connection lost'));
        client.set.mockRejectedValue(new Error('connection lost'));
        client.del.mockRejectedValue(new Error('connection lost'));
        const cache = makeCache(redis);

        await expect(cache.get('k')).resolves.toBeUndefined();
        await expect(cache.set('k', { id: 1 })).resolves.toBeUndefined();
        await expect(cache.del('k')).resolves.toBeUndefined();
    });

    it('без Redis чтение пустое, запись и сброс молчат', async () => {
        const cache = makeCache(undefined);

        await cache.set('k', { id: 1 });
        await cache.del('k');

        expect(await cache.get('k')).toBeUndefined();
    });

    it('сброс убирает запись; пустой список ключей в Redis не ходит', async () => {
        const { redis, client } = makeRedis();
        const cache = makeCache(redis);
        await cache.set('a', { id: 1 });
        await cache.set('b', { id: 2 });

        await cache.del('a', 'b');
        await cache.del();

        expect(await cache.get('a')).toBeUndefined();
        expect(await cache.get('b')).toBeUndefined();
        expect(client.del).toHaveBeenCalledTimes(1);
    });

    it('getOrLoad: промах загружает и кладёт, попадание не загружает', async () => {
        const { redis } = makeRedis();
        const cache = makeCache(redis);
        const load = jest.fn().mockResolvedValue({ id: 5 });

        expect(await cache.getOrLoad('k', load)).toEqual({ id: 5 });
        expect(await cache.getOrLoad('k', load)).toEqual({ id: 5 });

        expect(load).toHaveBeenCalledTimes(1);
    });

    it('getOrLoad: «не удалось» не кэшируется', async () => {
        const { redis, client } = makeRedis();
        const cache = makeCache(redis);
        const load = jest.fn().mockResolvedValue(undefined);

        expect(await cache.getOrLoad('k', load)).toBeUndefined();
        expect(await cache.getOrLoad('k', load)).toBeUndefined();

        expect(load).toHaveBeenCalledTimes(2);
        expect(client.set).not.toHaveBeenCalled();
    });
});
