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
            get: (key: string) => Promise.resolve(locks.get(key) ?? null),
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
            // Оба Lua-скрипта сравнивают значение лока с ARGV[1]: перехват
            // (в скрипте есть "set") подменяет его на ARGV[2], снятие — удаляет.
            eval: (
                script: string,
                _n: number,
                key: string,
                ...args: string[]
            ) => {
                if (locks.get(key) !== args[0]) return Promise.resolve(0);
                if (script.includes('"set"')) locks.set(key, args[1]);
                else locks.delete(key);
                return Promise.resolve(1);
            },
        },
    };
};

const LOCK_KEY = 'queue:event-sales-flow:lock:a.bitrix24.ru:company:431';
const DOMAIN_KEY = 'queue:event-sales-flow:domain:a.bitrix24.ru:active';
/** Лок, оставшийся от процесса, которого больше нет (выкладка). */
const lockOfDeadProcess = (ownerId: string) => `${ownerId}@previous-boot`;

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

    /*
     * Выкладка обрывает отчёт посреди работы: лок клиента и место домена
     * остаются в Redis на 10 минут, а повторная доставка перекладывается
     * только 7,5 минуты — и отчёт падал с «очередь перегружена». Поэтому
     * операция узнаёт свой лок по id и забирает его.
     */
    describe('перехват своего лока после перезапуска', () => {
        const OWNED = { ...REQUEST, ownerId: 'op-1' };

        it('лок той же операции от прошлого запуска забирается сразу', async () => {
            const redis = makeRedis();
            redis.locks.set(LOCK_KEY, lockOfDeadProcess('op-1'));
            redis.counters.set(DOMAIN_KEY, 1);

            const slot = await makeService(redis).acquire(OWNED);

            expect(slot.acquired).toBe(true);
            expect(redis.locks.get(LOCK_KEY)).not.toBe(
                lockOfDeadProcess('op-1'),
            );
        });

        it('место домена второй раз не занимается и возвращается после работы', async () => {
            const redis = makeRedis();
            redis.locks.set(LOCK_KEY, lockOfDeadProcess('op-1'));
            redis.counters.set(DOMAIN_KEY, 1);

            const slot = await makeService(redis).acquire(OWNED);
            expect(redis.counters.get(DOMAIN_KEY)).toBe(1);

            await slot.release();
            expect(redis.locks.has(LOCK_KEY)).toBe(false);
            expect(redis.counters.get(DOMAIN_KEY)).toBe(0);
        });

        it('проходит и при заполненном портале: оборваны были оба отчёта', async () => {
            const redis = makeRedis();
            redis.locks.set(LOCK_KEY, lockOfDeadProcess('op-1'));
            redis.counters.set(DOMAIN_KEY, REQUEST.maxPerDomain);

            const slot = await makeService(redis).acquire(OWNED);

            expect(slot.acquired).toBe(true);
        });

        it('лок ДРУГОЙ операции не трогается — клиент занят', async () => {
            const redis = makeRedis();
            redis.locks.set(LOCK_KEY, lockOfDeadProcess('op-2'));
            redis.counters.set(DOMAIN_KEY, 1);

            const slot = await makeService(redis).acquire(OWNED);

            expect(slot.acquired).toBe(false);
            expect(slot.reason).toBe('entity-busy');
            expect(redis.locks.get(LOCK_KEY)).toBe(lockOfDeadProcess('op-2'));
            expect(redis.counters.get(DOMAIN_KEY)).toBe(1);
        });

        it('свой лок ЭТОГО ЖЕ запуска не забирается: прошлая доставка могла не закончиться', async () => {
            const redis = makeRedis();
            const service = makeService(redis);
            const first = await service.acquire(OWNED);
            const held = redis.locks.get(LOCK_KEY);

            const second = await service.acquire(OWNED);

            expect(first.acquired).toBe(true);
            expect(second.acquired).toBe(false);
            expect(second.reason).toBe('entity-busy');
            expect(redis.locks.get(LOCK_KEY)).toBe(held);
        });

        it('лок без владельца не забирается', async () => {
            const redis = makeRedis();
            redis.locks.set(LOCK_KEY, 'plain-token');

            const slot = await makeService(redis).acquire(OWNED);

            expect(slot.acquired).toBe(false);
            expect(redis.locks.get(LOCK_KEY)).toBe('plain-token');
        });

        it('без ownerId чужой лок с владельцем ждётся, как раньше', async () => {
            const redis = makeRedis();
            redis.locks.set(LOCK_KEY, lockOfDeadProcess('op-1'));

            const slot = await makeService(redis).acquire(REQUEST);

            expect(slot.acquired).toBe(false);
            expect(slot.reason).toBe('entity-busy');
        });

        it('счётчик домена истёк до перехвата — release не уводит его в минус', async () => {
            const redis = makeRedis();
            redis.locks.set(LOCK_KEY, lockOfDeadProcess('op-1'));

            const slot = await makeService(redis).acquire(OWNED);
            await slot.release();

            expect(
                [...redis.counters.values()].every(value => value >= 0),
            ).toBe(true);
        });

        it('перехваченный лок снимается только своим release', async () => {
            const redis = makeRedis();
            redis.locks.set(LOCK_KEY, lockOfDeadProcess('op-1'));
            const slot = await makeService(redis).acquire(OWNED);

            // TTL истёк, клиента занял следующий отчёт.
            redis.locks.set(LOCK_KEY, lockOfDeadProcess('op-9'));
            await slot.release();

            expect(redis.locks.get(LOCK_KEY)).toBe(lockOfDeadProcess('op-9'));
        });
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
