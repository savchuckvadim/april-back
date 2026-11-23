import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';

/**
 * «Касса»: одна задача на ключ одновременно, сколько бы она ни шла.
 *
 * Зачем отдельно от {@link QueueConcurrencyService}: там слот живёт
 * фиксированные 10 минут — для отчёта с запасом, а окно холодного старта на
 * сотню клиентов идёт дольше. Здесь аренда короткая (2 минуты) и
 * продлевается каждые 30 секунд, пока задача жива. Процесс упал — продлевать
 * некому, касса освобождается сама через 2 минуты. Зависнуть навсегда ей
 * нечем.
 *
 * Ключ в Redis, а не в памяти процесса: обработчиков может быть несколько
 * (реплики, перезапуск посреди работы).
 */

/** Срок аренды без продления. */
export const QUEUE_LANE_LEASE_MS = 120_000;
/** Как часто живая задача продлевает аренду. */
export const QUEUE_LANE_RENEW_MS = 30_000;

/** Продлить только СВОЮ аренду: сравнение токена и pexpire атомарно. */
export const RENEW_LANE_IF_OWNER_LUA =
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end';
/** Снять только СВОЮ аренду — чужую свежую не тронуть. */
export const RELEASE_LANE_IF_OWNER_LUA =
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

export type QueueLaneAcquire =
    /** Касса твоя: работай и обязательно вызови release в finally. */
    | { status: 'acquired'; release: () => Promise<void> }
    /** Касса занята другой задачей того же ключа. */
    | { status: 'busy' }
    /** Redis не ответил — занята ли касса, неизвестно. */
    | { status: 'unavailable'; reason: string };

type LaneRedis = {
    set(
        key: string,
        value: string,
        px: 'PX',
        ms: number,
        nx: 'NX',
    ): Promise<'OK' | null>;
    eval(
        script: string,
        numKeys: number,
        key: string,
        ...args: string[]
    ): Promise<unknown>;
};

@Injectable()
export class QueueLaneService {
    private readonly logger = new Logger(QueueLaneService.name);

    constructor(private readonly redisService: RedisService) {}

    async acquire(input: {
        queue: string;
        /** Что сериализуем: у холодного старта — портал. */
        lane: string;
    }): Promise<QueueLaneAcquire> {
        const key = this.key(input.queue, input.lane);
        const token = randomUUID();
        let redis: LaneRedis;
        try {
            redis = this.redisService.getClient() as unknown as LaneRedis;
            const locked = await redis.set(
                key,
                token,
                'PX',
                QUEUE_LANE_LEASE_MS,
                'NX',
            );
            if (!locked) return { status: 'busy' };
        } catch (error) {
            return { status: 'unavailable', reason: (error as Error).message };
        }

        const renewTimer = setInterval(() => {
            void this.renew(redis, key, token);
        }, QUEUE_LANE_RENEW_MS);
        renewTimer.unref();

        let released = false;
        return {
            status: 'acquired',
            release: async () => {
                if (released) return;
                released = true;
                clearInterval(renewTimer);
                // Ошибку глушим: работа уже сделана, аренда истечёт сама.
                await redis
                    .eval(RELEASE_LANE_IF_OWNER_LUA, 1, key, token)
                    .catch(() => undefined);
            },
        };
    }

    /**
     * Продление. Ответ 0 — аренду потеряли (истекла, пока задача висела на
     * Битриксе дольше двух минут без продления, и кассу занял другой). Работу
     * посреди не остановить, но об этом надо знать: два окна одного ключа
     * могли пойти одновременно.
     */
    private async renew(
        redis: LaneRedis,
        key: string,
        token: string,
    ): Promise<void> {
        try {
            const renewed = await redis.eval(
                RENEW_LANE_IF_OWNER_LUA,
                1,
                key,
                token,
                String(QUEUE_LANE_LEASE_MS),
            );
            if (Number(renewed) !== 1) {
                this.logger.warn(
                    `касса ${key} потеряна во время работы — возможна параллельная обработка того же ключа`,
                    { telegram: true },
                );
            }
        } catch (error) {
            this.logger.warn(
                `касса ${key}: продление не удалось (${(error as Error).message}) — повторю через ${QUEUE_LANE_RENEW_MS / 1000} с`,
            );
        }
    }

    private key(queue: string, lane: string): string {
        return `queue:${queue}:lane:${lane}`;
    }
}
