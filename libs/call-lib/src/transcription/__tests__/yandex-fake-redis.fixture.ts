import type { RedisService } from '@lib/core/redis/redis.service';
import { YandexSubmissionStatsRepository } from '../repository/yandex-submission-stats.repository';
import { YandexSubmissionGuard } from '../provider/yandex-submission-guard.service';

type Arg = string | number;
type Reply = [Error | null, unknown];

/**
 * Redis в памяти — ровно те команды, которыми пользуются страж отправок в
 * Яндекс и счётчик расхода: SET с EX/NX, GET, DEL, EVAL трёх скриптов
 * (снять замок, продлить замок, счётчик попыток в окне), MULTI с HINCRBY и
 * EXPIRE, PIPELINE с HGETALL. Сроки запоминаются, но сами не истекают:
 * «прошло время» тест моделирует удалением ключа.
 */
export class YandexFakeRedis {
    readonly values = new Map<string, string>();
    readonly hashes = new Map<string, Map<string, number>>();
    readonly ttl = new Map<string, number>();

    readonly set = jest.fn((key: string, value: string, ...args: Arg[]) => {
        if (args.includes('NX') && this.values.has(key)) {
            return Promise.resolve(null);
        }
        this.values.set(key, value);
        const ex = args.indexOf('EX');
        if (ex >= 0) this.ttl.set(key, Number(args[ex + 1]));
        return Promise.resolve('OK');
    });

    readonly get = jest.fn((key: string) =>
        Promise.resolve(this.values.get(key) ?? null),
    );

    readonly del = jest.fn((key: string) =>
        Promise.resolve(this.values.delete(key) ? 1 : 0),
    );

    readonly eval = jest.fn(
        (script: string, _keys: number, key: string, ...args: Arg[]) => {
            if (script.includes("'incr'")) {
                const next = Number(this.values.get(key) ?? 0) + 1;
                this.values.set(key, String(next));
                if (next === 1) this.ttl.set(key, Number(args[0]));
                return Promise.resolve(next);
            }
            if (this.values.get(key) !== args[0]) return Promise.resolve(0);
            if (script.includes("'del'")) this.values.delete(key);
            else this.ttl.set(key, Number(args[1]));
            return Promise.resolve(1);
        },
    );

    multi(): {
        hincrby: (key: string, field: string, by: number) => unknown;
        expire: (key: string, sec: number) => unknown;
        exec: () => Promise<Reply[]>;
    } {
        const ops: (() => Reply)[] = [];
        const chain = {
            hincrby: (key: string, field: string, by: number) => {
                ops.push(() => {
                    const hash =
                        this.hashes.get(key) ?? new Map<string, number>();
                    hash.set(field, (hash.get(field) ?? 0) + by);
                    this.hashes.set(key, hash);
                    return [null, hash.get(field)];
                });
                return chain;
            },
            expire: (key: string, sec: number) => {
                ops.push(() => {
                    this.ttl.set(key, sec);
                    return [null, 1];
                });
                return chain;
            },
            exec: () => Promise.resolve(ops.map(op => op())),
        };
        return chain;
    }

    pipeline(): {
        hgetall: (key: string) => unknown;
        exec: () => Promise<Reply[]>;
    } {
        const keys: string[] = [];
        const chain = {
            hgetall: (key: string) => {
                keys.push(key);
                return chain;
            },
            exec: () =>
                Promise.resolve(
                    keys.map((key): Reply => {
                        const hash =
                            this.hashes.get(key) ?? new Map<string, number>();
                        return [
                            null,
                            Object.fromEntries(
                                [...hash].map(([field, value]) => [
                                    field,
                                    String(value),
                                ]),
                            ),
                        ];
                    }),
                ),
        };
        return chain;
    }

    service(): RedisService {
        return { getClient: () => this } as never;
    }
}

/** Настоящий страж и счётчик поверх Redis в памяти. */
export const makeGuard = (
    redis = new YandexFakeRedis(),
): {
    redis: YandexFakeRedis;
    guard: YandexSubmissionGuard;
    stats: YandexSubmissionStatsRepository;
} => {
    const stats = new YandexSubmissionStatsRepository(redis.service());
    const guard = new YandexSubmissionGuard(redis.service(), stats);
    return { redis, guard, stats };
};
