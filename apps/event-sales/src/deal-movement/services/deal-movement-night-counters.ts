import { Injectable } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { DEAL_MOVEMENT_REDIS_KEYS } from '@lib/sales-ai-analytics';
import { DEAL_MOVEMENT_TTL_SEC } from '../constants/deal-movement.const';

/** Что считаем за день портала: записи в ленту и вызовы модели. */
export const DEAL_MOVEMENT_NIGHT_COUNTERS = {
    notes: DEAL_MOVEMENT_REDIS_KEYS.nightNotes,
    texts: DEAL_MOVEMENT_REDIS_KEYS.nightTexts,
} as const;
export type DealMovementNightCounter =
    keyof typeof DEAL_MOVEMENT_NIGHT_COUNTERS;

/**
 * Счётчики дня портала в Redis (решение 17.11.2026): лимиты «записей за
 * ночь» и «подсказок за ночь» общие для ночного и ручного счёта — второй
 * прогон в тот же день не превысит лимит. Прогоны портала идут под одним
 * замком, поэтому «прочитать — сравнить — прибавить» без гонки.
 *
 * `@Injectable` без bitrix-состояния: только Redis.
 */
@Injectable()
export class DealMovementNightCounters {
    constructor(private readonly redisService: RedisService) {}

    async used(
        domain: string,
        day: string,
        counter: DealMovementNightCounter,
    ): Promise<number> {
        const raw = await this.redisService
            .getClient()
            .get(DEAL_MOVEMENT_NIGHT_COUNTERS[counter](domain, day));
        const value = Number(raw);
        return raw !== null && Number.isFinite(value) && value > 0 ? value : 0;
    }

    async increment(
        domain: string,
        day: string,
        counter: DealMovementNightCounter,
    ): Promise<void> {
        const redis = this.redisService.getClient();
        const key = DEAL_MOVEMENT_NIGHT_COUNTERS[counter](domain, day);
        await redis.incr(key);
        await redis.expire(key, DEAL_MOVEMENT_TTL_SEC.nightCounter);
    }
}
