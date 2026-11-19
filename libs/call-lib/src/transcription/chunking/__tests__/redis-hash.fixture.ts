import type { RedisService } from '@lib/core/redis/redis.service';

/**
 * Redis в памяти с хешами — ровно те команды, которыми пишет прогресс
 * кусков (hgetall / hset / expire / del). `fail` — Redis «лежит»: каждая
 * команда отвечает ошибкой.
 */
export interface HashRedis {
    redis: RedisService;
    hashes: Map<string, Map<string, string>>;
    ttlByKey: Map<string, number>;
    state: { fail: boolean };
}

export function createHashRedis(): HashRedis {
    const hashes = new Map<string, Map<string, string>>();
    const ttlByKey = new Map<string, number>();
    const state = { fail: false };
    const guard = (): void => {
        if (state.fail) throw new Error('connect ECONNREFUSED');
    };

    const client = {
        hgetall: (key: string): Promise<Record<string, string>> => {
            guard();
            return Promise.resolve(Object.fromEntries(hashes.get(key) ?? []));
        },
        hset: (key: string, field: string, value: string): Promise<number> => {
            guard();
            const hash = hashes.get(key) ?? new Map<string, string>();
            hash.set(field, value);
            hashes.set(key, hash);
            return Promise.resolve(1);
        },
        expire: (key: string, sec: number): Promise<number> => {
            guard();
            ttlByKey.set(key, sec);
            return Promise.resolve(1);
        },
        del: (...keys: string[]): Promise<number> => {
            guard();
            let removed = 0;
            for (const key of keys) {
                if (hashes.delete(key)) removed += 1;
                ttlByKey.delete(key);
            }
            return Promise.resolve(removed);
        },
    };

    return {
        redis: { getClient: () => client } as unknown as RedisService,
        hashes,
        ttlByKey,
        state,
    };
}
