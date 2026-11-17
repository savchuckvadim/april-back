import { RedisService } from '@lib/core/redis/redis.service';

type Arg = string | number;

/**
 * Redis в памяти — ровно те команды, которыми пользуется каркас отчётов:
 * SET с EX/NX, GET, DEL, EXISTS, EVAL двух скриптов замка, множества.
 * `fail = true` — каждая команда падает, как недоступный Redis.
 */
export class FakeRedis {
    readonly values = new Map<string, string>();
    readonly ttl = new Map<string, number>();
    readonly sets = new Map<string, Set<string>>();
    fail = false;

    readonly set = jest.fn((key: string, value: string, ...args: Arg[]) =>
        this.run(() => {
            if (args.includes('NX') && this.values.has(key)) return null;
            this.values.set(key, value);
            const ex = args.indexOf('EX');
            if (ex >= 0) this.ttl.set(key, Number(args[ex + 1]));
            return 'OK';
        }),
    );

    readonly get = jest.fn((key: string) =>
        this.run(() => this.values.get(key) ?? null),
    );

    readonly del = jest.fn((key: string) =>
        this.run(() => (this.values.delete(key) ? 1 : 0)),
    );

    readonly exists = jest.fn((key: string) =>
        this.run(() => (this.values.has(key) ? 1 : 0)),
    );

    /** Скрипты замка: снять или продлить, только если значение — наш токен. */
    readonly eval = jest.fn(
        (
            script: string,
            _keys: number,
            key: string,
            token: string,
            ttl?: string,
        ) =>
            this.run(() => {
                if (this.values.get(key) !== token) return 0;
                if (script.includes("'del'")) {
                    this.values.delete(key);
                } else {
                    this.ttl.set(key, Number(ttl));
                }
                return 1;
            }),
    );

    readonly sadd = jest.fn((key: string, member: string) =>
        this.run(() => {
            const set = this.sets.get(key) ?? new Set<string>();
            set.add(member);
            this.sets.set(key, set);
            return 1;
        }),
    );

    readonly smembers = jest.fn((key: string) =>
        this.run(() => [...(this.sets.get(key) ?? [])]),
    );

    readonly srem = jest.fn((key: string, member: string) =>
        this.run(() => (this.sets.get(key)?.delete(member) ? 1 : 0)),
    );

    readonly expire = jest.fn((key: string, seconds: number) =>
        this.run(() => {
            this.ttl.set(key, seconds);
            return 1;
        }),
    );

    /** Сервис-обёртка, как его видят классы каркаса. */
    service(): RedisService {
        return { getClient: () => this } as never;
    }

    private run<T>(command: () => T): Promise<T> {
        return this.fail
            ? Promise.reject(new Error('redis down'))
            : Promise.resolve(command());
    }
}
