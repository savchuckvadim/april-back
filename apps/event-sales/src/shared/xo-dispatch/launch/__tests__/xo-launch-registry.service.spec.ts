import {
    XO_LAUNCH_DONE_TTL_MS,
    XO_LAUNCH_PENDING_TTL_MS,
    XoLaunchRegistryService,
} from '../xo-launch-registry.service';

/**
 * Redis в памяти — только команды реестра. Сроки жизни запоминаются, но не
 * истекают: проверяем, КАКОЙ срок поставлен.
 */
const makeRedis = () => {
    const hashes = new Map<string, Map<string, string>>();
    const strings = new Map<string, string>();
    const ttl = new Map<string, number>();

    const commands = {
        hset: (key: string, field: string, value: string) => {
            const hash = hashes.get(key) ?? new Map<string, string>();
            hash.set(field, value);
            hashes.set(key, hash);
            return 1;
        },
        hdel: (key: string, field: string) =>
            hashes.get(key)?.delete(field) ? 1 : 0,
        hlen: (key: string) => hashes.get(key)?.size ?? 0,
        pexpire: (key: string, ms: number) => {
            ttl.set(key, ms);
            return 1;
        },
        set: (key: string, value: string, _px: 'PX', ms: number) => {
            strings.set(key, value);
            ttl.set(key, ms);
            return 'OK';
        },
    };

    /** MULTI и pipeline — одинаково: копим команды, exec выполняет все. */
    const batch = () => {
        const ops: Array<() => unknown> = [];
        const chain = {
            hset: (k: string, f: string, v: string) => (
                ops.push(() => commands.hset(k, f, v)),
                chain
            ),
            hdel: (k: string, f: string) => (
                ops.push(() => commands.hdel(k, f)),
                chain
            ),
            hlen: (k: string) => (ops.push(() => commands.hlen(k)), chain),
            pexpire: (k: string, ms: number) => (
                ops.push(() => commands.pexpire(k, ms)),
                chain
            ),
            set: (k: string, v: string, px: 'PX', ms: number) => (
                ops.push(() => commands.set(k, v, px, ms)),
                chain
            ),
            exec: () =>
                Promise.resolve(ops.map(op => [null, op()] as [null, unknown])),
        };
        return chain;
    };

    return {
        hashes,
        strings,
        ttl,
        client: {
            multi: batch,
            pipeline: batch,
            mget: (...keys: string[]) =>
                Promise.resolve(keys.map(key => strings.get(key) ?? null)),
        },
    };
};

const DOMAIN = 'gsr.bitrix24.ru';
const PENDING = `xo2:launch:${DOMAIN}:company:117743:pending`;

const makeService = (redis: ReturnType<typeof makeRedis>) =>
    new XoLaunchRegistryService({ getClient: () => redis.client } as never);

describe('реестр запусков ХО (Redis)', () => {
    it('принятый хук помечает карточку «ждёт обработки» на час', async () => {
        const redis = makeRedis();
        const registry = makeService(redis);

        await registry.markPending(DOMAIN, 'company:117743', {
            id: 'L1',
            acceptedAt: 1000,
        });

        expect(redis.hashes.get(PENDING)?.get('L1')).toBe('1000');
        expect(redis.ttl.get(PENDING)).toBe(XO_LAUNCH_PENDING_TTL_MS);
        expect(await registry.pending(DOMAIN, ['company:117743'])).toEqual(
            new Set(['company:117743']),
        );
    });

    it('два ждущих запуска: снят один — карточка всё ещё ждёт', async () => {
        const registry = makeService(makeRedis());
        await registry.markPending(DOMAIN, 'company:117743', {
            id: 'L1',
            acceptedAt: 1000,
        });
        await registry.markPending(DOMAIN, 'company:117743', {
            id: 'L2',
            acceptedAt: 2000,
        });

        await registry.clearPending(DOMAIN, [
            { entityKey: 'company:117743', launchId: 'L1' },
        ]);
        expect((await registry.pending(DOMAIN, ['company:117743']))?.size).toBe(
            1,
        );

        await registry.clearPending(DOMAIN, [
            { entityKey: 'company:117743', launchId: 'L2' },
        ]);
        expect((await registry.pending(DOMAIN, ['company:117743']))?.size).toBe(
            0,
        );
    });

    it('завершённый запуск помнится 6 часов и читается по клиенту', async () => {
        const redis = makeRedis();
        const registry = makeService(redis);

        await registry.markDone(
            DOMAIN,
            [
                {
                    clientKey: 'company:117743',
                    launch: { id: 'L1', acceptedAt: 1000 },
                },
            ],
            5000,
        );

        const done = await registry.lastDone(DOMAIN, [
            'company:117743',
            'company:1',
        ]);
        expect(done.get('company:117743')).toEqual({
            launchId: 'L1',
            acceptedAt: 1000,
            finishedAt: 5000,
        });
        expect(done.has('company:1')).toBe(false);
        expect(redis.ttl.get(`xo2:launch:${DOMAIN}:company:117743:done`)).toBe(
            XO_LAUNCH_DONE_TTL_MS,
        );
    });

    it('Redis не ответил — «ничего не известно», без исключений', async () => {
        const broken = new XoLaunchRegistryService({
            getClient: () => {
                throw new Error('ECONNREFUSED');
            },
        } as never);

        await expect(
            broken.markPending(DOMAIN, 'company:1', { id: 'L', acceptedAt: 1 }),
        ).resolves.toBeUndefined();
        expect(await broken.pending(DOMAIN, ['company:1'])).toBeNull();
        expect((await broken.lastDone(DOMAIN, ['company:1'])).size).toBe(0);
    });
});
