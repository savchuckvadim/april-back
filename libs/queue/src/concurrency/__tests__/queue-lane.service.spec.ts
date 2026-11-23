import {
    QUEUE_LANE_LEASE_MS,
    QUEUE_LANE_RENEW_MS,
    QueueLaneService,
    RELEASE_LANE_IF_OWNER_LUA,
    RENEW_LANE_IF_OWNER_LUA,
} from '../queue-lane.service';

/**
 * Касса: одна задача на ключ. Аренда короткая и продлевается, пока задача
 * жива; снимает и продлевает её только владелец.
 */
const makeRedis = () => {
    const leases = new Map<string, { token: string; ttl: number }>();
    return {
        leases,
        client: {
            set: (key: string, token: string, _px: 'PX', ttl: number) => {
                if (leases.has(key)) return Promise.resolve(null);
                leases.set(key, { token, ttl });
                return Promise.resolve('OK');
            },
            eval: (
                script: string,
                _n: number,
                key: string,
                token: string,
                ttl?: string,
            ) => {
                const lease = leases.get(key);
                if (lease?.token !== token) return Promise.resolve(0);
                if (script === RENEW_LANE_IF_OWNER_LUA) {
                    lease.ttl = Number(ttl);
                    return Promise.resolve(1);
                }
                if (script === RELEASE_LANE_IF_OWNER_LUA) {
                    leases.delete(key);
                    return Promise.resolve(1);
                }
                return Promise.resolve(0);
            },
        },
    };
};

const makeService = (redis: ReturnType<typeof makeRedis>) =>
    new QueueLaneService({ getClient: () => redis.client } as never);

const GARANT = {
    queue: 'event-sales-cold-call-v2',
    lane: 'garant.bitrix24.ru',
};
const GSR = { queue: 'event-sales-cold-call-v2', lane: 'gsr.bitrix24.ru' };

describe('QueueLaneService — касса на ключ', () => {
    afterEach(() => jest.useRealTimers());

    it('свободная касса выдаётся на 2 минуты', async () => {
        const redis = makeRedis();
        const lane = await makeService(redis).acquire(GARANT);

        expect(lane.status).toBe('acquired');
        expect(
            redis.leases.get(`queue:${GARANT.queue}:lane:${GARANT.lane}`)?.ttl,
        ).toBe(QUEUE_LANE_LEASE_MS);
        if (lane.status === 'acquired') await lane.release();
    });

    it('второе окно того же портала ждёт, другой портал — нет', async () => {
        const service = makeService(makeRedis());
        const first = await service.acquire(GARANT);

        expect((await service.acquire(GARANT)).status).toBe('busy');
        const other = await service.acquire(GSR);
        expect(other.status).toBe('acquired');

        if (first.status === 'acquired') await first.release();
        if (other.status === 'acquired') await other.release();
    });

    it('после release касса снова свободна', async () => {
        const service = makeService(makeRedis());
        const first = await service.acquire(GARANT);
        if (first.status === 'acquired') await first.release();

        const next = await service.acquire(GARANT);
        expect(next.status).toBe('acquired');
        if (next.status === 'acquired') await next.release();
    });

    it('release чужую кассу не снимает (аренда истекла и её занял другой)', async () => {
        const redis = makeRedis();
        const service = makeService(redis);
        const stale = await service.acquire(GARANT);
        const key = `queue:${GARANT.queue}:lane:${GARANT.lane}`;
        redis.leases.set(key, { token: 'другой', ttl: QUEUE_LANE_LEASE_MS });

        if (stale.status === 'acquired') await stale.release();

        expect(redis.leases.get(key)?.token).toBe('другой');
    });

    it('живая задача продлевает аренду каждые 30 секунд', async () => {
        jest.useFakeTimers();
        const redis = makeRedis();
        const lane = await makeService(redis).acquire(GARANT);
        const key = `queue:${GARANT.queue}:lane:${GARANT.lane}`;
        redis.leases.get(key)!.ttl = 1;

        jest.advanceTimersByTime(QUEUE_LANE_RENEW_MS);
        await Promise.resolve();

        expect(redis.leases.get(key)?.ttl).toBe(QUEUE_LANE_LEASE_MS);
        if (lane.status === 'acquired') await lane.release();
    });

    it('Redis не ответил — «неизвестно», а не «свободно»', async () => {
        const service = new QueueLaneService({
            getClient: () => ({
                set: () => Promise.reject(new Error('ECONNREFUSED')),
            }),
        } as never);

        const lane = await service.acquire(GARANT);

        expect(lane).toEqual({ status: 'unavailable', reason: 'ECONNREFUSED' });
    });
});
