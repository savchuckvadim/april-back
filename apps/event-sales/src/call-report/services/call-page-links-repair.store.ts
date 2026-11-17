import { Injectable } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';

/** Сколько живут отметки проверенных разборов и счётчики попыток. */
const MARKS_TTL_SEC = 30 * 24 * 60 * 60;

const seenKey = (domain: string): string =>
    `call-report:links-repair:seen:${domain.toLowerCase()}`;
const attemptsKey = (recordId: string): string =>
    `call-report:links-repair:attempts:${recordId}`;
const doneKey = (domain: string): string =>
    `call-report:links-repair:done:${domain.toLowerCase()}`;

/**
 * Отметки починки ссылок на страницу разбора в Redis (без таблицы, миграция
 * не нужна): какие разборы портала уже проверены, сколько раз проверка
 * разбора срывалась и пройден ли портал целиком. Отметка «портал пройден»
 * бессрочная: без неё шаг раз в месяц заново обходил бы уже чистые ленты.
 */
@Injectable()
export class CallPageLinksRepairStore {
    constructor(private readonly redisService: RedisService) {}

    async isDone(domain: string): Promise<boolean> {
        const value = await this.redisService.getClient().get(doneKey(domain));
        return value !== null;
    }

    /** @param at момент, когда портал пройден, ISO 8601 */
    async markDone(domain: string, at: string): Promise<void> {
        await this.redisService.getClient().set(doneKey(domain), at);
    }

    /** Идентификаторы разборов портала, которые уже проверены. */
    async seen(domain: string): Promise<Set<string>> {
        const ids = await this.redisService
            .getClient()
            .smembers(seenKey(domain));
        return new Set(ids ?? []);
    }

    async markSeen(domain: string, recordId: string): Promise<void> {
        const redis = this.redisService.getClient();
        const key = seenKey(domain);
        await redis.sadd(key, recordId);
        await redis.expire(key, MARKS_TTL_SEC);
    }

    /** Ещё одна неудачная проверка разбора; возвращает номер этой попытки. */
    async bumpAttempt(recordId: string): Promise<number> {
        const redis = this.redisService.getClient();
        const key = attemptsKey(recordId);
        const count = await redis.incr(key);
        await redis.expire(key, MARKS_TTL_SEC);
        return count;
    }
}
