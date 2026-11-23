/**
 * Redis в памяти — ровно те команды, что зовёт окно тишины, со сроками
 * жизни по управляемым часам (`advance`). Не мок вызовов: тесты проверяют
 * поведение (что истекло, что забрано), а не порядок команд.
 */
type Entry = { value: string | Map<string, string>; expiresAt: number | null };

type MultiReply = [Error | null, unknown][];

export class FakeSilenceRedis {
    private now = 0;
    private readonly store = new Map<string, Entry>();
    multiCalls = 0;

    advance(ms: number): void {
        this.now += ms;
    }

    /** Остаток жизни ключа в мс; -1 — бессрочный, -2 — ключа нет. */
    ttlMs(key: string): number {
        const entry = this.alive(key);
        if (!entry) return -2;
        return entry.expiresAt === null ? -1 : entry.expiresAt - this.now;
    }

    exists(key: string): number {
        return this.alive(key) ? 1 : 0;
    }

    incr(key: string): Promise<number> {
        const entry = this.alive(key);
        const next = Number(entry?.value ?? 0) + 1;
        this.store.set(key, {
            value: String(next),
            expiresAt: entry?.expiresAt ?? null,
        });
        return Promise.resolve(next);
    }

    pexpire(key: string, ms: number): Promise<number> {
        const entry = this.alive(key);
        if (!entry) return Promise.resolve(0);
        entry.expiresAt = this.now + ms;
        return Promise.resolve(1);
    }

    hset(key: string, field: string, value: string): Promise<number> {
        const entry = this.alive(key);
        const hash =
            entry && entry.value instanceof Map
                ? entry.value
                : new Map<string, string>();
        hash.set(field, value);
        this.store.set(key, {
            value: hash,
            expiresAt: entry?.expiresAt ?? null,
        });
        return Promise.resolve(1);
    }

    set(
        key: string,
        value: string,
        _px: 'PX',
        ms: number,
        nx?: 'NX',
    ): Promise<'OK' | null> {
        if (nx && this.alive(key)) return Promise.resolve(null);
        this.store.set(key, { value, expiresAt: this.now + ms });
        return Promise.resolve('OK');
    }

    del(key: string): Promise<number> {
        const had = this.exists(key);
        this.store.delete(key);
        return Promise.resolve(had);
    }

    hgetall(key: string): Record<string, string> {
        const entry = this.alive(key);
        if (!entry || !(entry.value instanceof Map)) return {};
        return Object.fromEntries(entry.value);
    }

    multi() {
        this.multiCalls += 1;
        const ops: Array<() => unknown> = [];
        const chain = {
            hgetall: (key: string) => {
                ops.push(() => this.hgetall(key));
                return chain;
            },
            del: (key: string) => {
                ops.push(() => {
                    const had = this.exists(key);
                    this.store.delete(key);
                    return had;
                });
                return chain;
            },
            // Все команды подряд, без await между ними — как MULTI/EXEC.
            exec: (): Promise<MultiReply> =>
                Promise.resolve(ops.map(op => [null, op()] as [null, unknown])),
        };
        return chain;
    }

    private alive(key: string): Entry | null {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (entry.expiresAt !== null && entry.expiresAt <= this.now) {
            this.store.delete(key);
            return null;
        }
        return entry;
    }
}
