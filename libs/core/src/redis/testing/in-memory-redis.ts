import { RedisService } from '../redis.service';

/**
 * Redis в памяти — для юнит-тестов кэшей поверх `RedisService`.
 *
 * Покрывает ровно те команды, которыми пользуются короткие кэши монорепы
 * (get / set со сроком / del / mget), и считает обращения — тесту нужно
 * отличать «прочитали из кэша» от «сходили в Битрикс». Срок жизни записи
 * запоминается, но сам не истекает: «прошло время» тест моделирует
 * удалением ключа (`store.delete`).
 */
export interface InMemoryRedis {
    redis: RedisService;
    store: Map<string, string>;
    /** Срок жизни, с которым ключ был записан, секунд. */
    ttlByKey: Map<string, number>;
    calls: { get: number; set: number; del: number };
}

export const createInMemoryRedis = (): InMemoryRedis => {
    const store = new Map<string, string>();
    const ttlByKey = new Map<string, number>();
    const calls = { get: 0, set: 0, del: 0 };

    const client = {
        get: (key: string): Promise<string | null> => {
            calls.get += 1;
            return Promise.resolve(store.get(key) ?? null);
        },
        mget: (keys: string[]): Promise<(string | null)[]> => {
            calls.get += 1;
            return Promise.resolve(keys.map(key => store.get(key) ?? null));
        },
        set: (
            key: string,
            value: string,
            _mode?: string,
            ttlSec?: number,
        ): Promise<'OK'> => {
            calls.set += 1;
            store.set(key, value);
            if (typeof ttlSec === 'number') ttlByKey.set(key, ttlSec);
            return Promise.resolve('OK');
        },
        del: (...keys: string[]): Promise<number> => {
            calls.del += 1;
            let removed = 0;
            for (const key of keys) {
                if (store.delete(key)) removed += 1;
                ttlByKey.delete(key);
            }
            return Promise.resolve(removed);
        },
    };

    return {
        redis: { getClient: () => client } as unknown as RedisService,
        store,
        ttlByKey,
        calls,
    };
};
