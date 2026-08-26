import { QueueConcurrencyService } from '../queue-concurrency.service';

/**
 * Слот выдаётся, когда домен не выбрал лимит И клиент свободен. Обе
 * проверки — Redis: воркеров может быть несколько реплик. Redis лёг —
 * работаем без ограничений, а не падаем.
 */
const makeRedis = () => {
    const counters = new Map<string, number>();
    const locks = new Map<string, string>();
    return {
        counters,
        locks,
        client: {
            incr: (key: string) => {
                const next = (counters.get(key) ?? 0) + 1;
                counters.set(key, next);
                return Promise.resolve(next);
            },
            decr: (key: string) => {
                const next = (counters.get(key) ?? 0) - 1;
                counters.set(key, next);
                return Promise.resolve(next);
            },
            expire: () => Promise.resolve(1),
            set: (key: string, value: string) => {
                if (locks.has(key)) return Promise.resolve(null);
                locks.set(key, value);
                return Promise.resolve('OK');
            },
            del: (key: string) => {
                locks.delete(key);
                counters.delete(key);
                return Promise.resolve(1);
            },
            // Lua release-if-owner: удаляет лок только при совпадении токена.
            eval: (_script: string, _n: number, key: string, arg: string) => {
                if (locks.get(key) === arg) {
                    locks.delete(key);
                    return Promise.resolve(1);
                }
                return Promise.resolve(0);
            },
        },
    };
};

const makeService = (redis: ReturnType<typeof makeRedis>) =>
    new QueueConcurrencyService({
        getClient: () => redis.client,
    } as never);

const REQUEST = {
    queue: 'event-sales-flow',
    domain: 'a.bitrix24.ru',
    entityKey: 'company:431',
    maxPerDomain: 2,
};

describe('QueueConcurrencyService', () => {
    it('первый джоб клиента получает слот', async () => {
        const service = makeService(makeRedis());
        const slot = await service.acquire(REQUEST);
        expect(slot.acquired).toBe(true);
    });

    it('второй джоб ТОГО ЖЕ клиента ждёт (иначе дубль основной сделки)', async () => {
        const service = makeService(makeRedis());
        await service.acquire(REQUEST);
        const second = await service.acquire(REQUEST);

        expect(second.acquired).toBe(false);
        expect(second.reason).toBe('entity-busy');
    });

    it('другой клиент того же портала идёт параллельно', async () => {
        const service = makeService(makeRedis());
        await service.acquire(REQUEST);
        const other = await service.acquire({
            ...REQUEST,
            entityKey: 'company:999',
        });

        expect(other.acquired).toBe(true);
    });

    it('домен не берёт больше своего лимита', async () => {
        const service = makeService(makeRedis());
        await service.acquire({ ...REQUEST, entityKey: 'company:1' });
        await service.acquire({ ...REQUEST, entityKey: 'company:2' });
        const third = await service.acquire({
            ...REQUEST,
            entityKey: 'company:3',
        });

        expect(third.acquired).toBe(false);
        expect(third.reason).toBe('domain-full');
    });

    it('чужой портал лимитом соседа не задет', async () => {
        const service = makeService(makeRedis());
        await service.acquire({ ...REQUEST, entityKey: 'company:1' });
        await service.acquire({ ...REQUEST, entityKey: 'company:2' });
        const other = await service.acquire({
            ...REQUEST,
            domain: 'b.bitrix24.ru',
            entityKey: 'company:1',
        });

        expect(other.acquired).toBe(true);
    });

    it('release освобождает и клиента, и слот домена', async () => {
        const redis = makeRedis();
        const service = makeService(redis);
        const first = await service.acquire(REQUEST);
        await first.release();

        expect(redis.locks.size).toBe(0);
        expect([...redis.counters.values()].every(v => v === 0)).toBe(true);
        const again = await service.acquire(REQUEST);
        expect(again.acquired).toBe(true);
    });

    it('release идемпотентен — счётчик домена не уходит в минус', async () => {
        const redis = makeRedis();
        const service = makeService(redis);
        const slot = await service.acquire(REQUEST);
        await slot.release();
        await slot.release();

        expect([...redis.counters.values()].every(value => value >= 0)).toBe(
            true,
        );
    });

    it('release пережившего TTL джоба не удаляет чужой свежий лок', async () => {
        const redis = makeRedis();
        const service = makeService(redis);
        const stale = await service.acquire(REQUEST);

        // TTL истёк, лок захватил следующий джоб со своим токеном.
        const [lockKey] = [...redis.locks.keys()];
        redis.locks.set(lockKey, 'other-token');

        await stale.release();
        expect(redis.locks.get(lockKey)).toBe('other-token');
    });

    it('отказ клиентского лока возвращает слот домена (иначе домен «протечёт»)', async () => {
        const redis = makeRedis();
        const service = makeService(redis);
        await service.acquire(REQUEST);
        const key = 'queue:event-sales-flow:domain:a.bitrix24.ru:active';

        await service.acquire(REQUEST); // entity-busy
        expect(redis.counters.get(key)).toBe(1);
    });

    it('без entityKey работает только лимит домена', async () => {
        const service = makeService(makeRedis());
        const first = await service.acquire({ ...REQUEST, entityKey: null });
        const second = await service.acquire({ ...REQUEST, entityKey: null });

        expect(first.acquired).toBe(true);
        expect(second.acquired).toBe(true);
    });

    it('Redis недоступен — джоб выполняется, очередь важнее оптимизации', async () => {
        const service = new QueueConcurrencyService({
            getClient: () => {
                throw new Error('redis down');
            },
        } as never);

        const slot = await service.acquire(REQUEST);
        expect(slot.acquired).toBe(true);
        await expect(slot.release()).resolves.toBeUndefined();
    });
});
