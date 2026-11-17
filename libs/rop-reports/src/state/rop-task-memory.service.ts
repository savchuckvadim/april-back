import { Injectable } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { RopTaskMemo, RopTaskMemoryPort } from '../delivery/rop-delivery.types';
import { toId } from '../recipients/department-heads.util';

/**
 * Последняя задача-отчёт получателя в Redis — вместе с ключом периода,
 * за который она поставлена, — и множество получателей отчёта.
 *
 * Ключ периода нужен для идемпотентности: повтор прогона того же периода
 * (сбой на середине рассылки, повтор по таймеру) находит уже поставленную
 * задачу и вторую не ставит. Следующий период находит прошлую задачу и
 * закрывает её. Потеря ключа не страшна: прошлую задачу закроет сам
 * получатель.
 */
@Injectable()
export class RopTaskMemoryService implements RopTaskMemoryPort {
    constructor(private readonly redisService: RedisService) {}

    async previous(taskKey: string): Promise<RopTaskMemo | null> {
        const raw = await this.redisService.getClient().get(taskKey);
        return parseMemo(raw);
    }

    async remember(
        taskKey: string,
        recipientsKey: string,
        userId: number,
        memo: RopTaskMemo,
        ttlSec: number,
    ): Promise<void> {
        const client = this.redisService.getClient();
        await client.set(taskKey, JSON.stringify(memo), 'EX', ttlSec);
        await client.sadd(recipientsKey, String(userId));
        await client.expire(recipientsKey, ttlSec);
    }

    async recipients(recipientsKey: string): Promise<number[]> {
        const raw = await this.redisService.getClient().smembers(recipientsKey);
        return raw.map(toId).filter((id): id is number => id !== null);
    }

    async forget(
        taskKey: string,
        recipientsKey: string,
        userId: number,
    ): Promise<void> {
        const client = this.redisService.getClient();
        await client.del(taskKey);
        await client.srem(recipientsKey, String(userId));
    }
}

/** Запись памяти → период и задача; чужая или битая — null. */
function parseMemo(raw: string | null): RopTaskMemo | null {
    if (!raw) return null;
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof value !== 'object' || value === null) return null;
    const { periodKey, taskId } = value as Record<string, unknown>;
    const id = toId(taskId);
    return typeof periodKey === 'string' && periodKey && id !== null
        ? { periodKey, taskId: id }
        : null;
}
