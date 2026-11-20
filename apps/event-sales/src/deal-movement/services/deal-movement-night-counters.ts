import { Injectable } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { DEAL_MOVEMENT_REDIS_KEYS } from '@lib/sales-ai-analytics';
import { DEAL_MOVEMENT_TTL_SEC } from '../constants/deal-movement.const';
import {
    parseDealMovementPeriodDigestMark,
    type DealMovementPeriodDigestMark,
} from '../lib/deal-movement-digest.schedule';

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

    /**
     * Отметка «сводка руководителям за этот день портала уже уходила»: true
     * — отметку поставили сейчас (слать), false — она уже была (повторный
     * тик той же ночи сводку не дублирует).
     */
    async claimDigest(domain: string, day: string): Promise<boolean> {
        const result = await this.redisService
            .getClient()
            .set(
                DEAL_MOVEMENT_REDIS_KEYS.digestDay(domain, day),
                new Date().toISOString(),
                'EX',
                DEAL_MOVEMENT_TTL_SEC.nightCounter,
                'NX',
            );
        return result === 'OK';
    }

    /** Последняя сводка за период (неделя / две недели); не было — null. */
    async periodDigestMark(
        domain: string,
    ): Promise<DealMovementPeriodDigestMark | null> {
        return parseDealMovementPeriodDigestMark(
            await this.redisService
                .getClient()
                .get(DEAL_MOVEMENT_REDIS_KEYS.digestLast(domain)),
        );
    }

    /**
     * Отметка сводки за период — ДО рассылки, как у ежедневной: лучше
     * потерять сводку при сбое, чем прислать её дважды. Прогоны портала
     * идут под одним замком, поэтому «прочитать — сравнить — записать»
     * без гонки.
     */
    async markPeriodDigest(
        domain: string,
        mark: DealMovementPeriodDigestMark,
    ): Promise<void> {
        await this.redisService
            .getClient()
            .set(
                DEAL_MOVEMENT_REDIS_KEYS.digestLast(domain),
                JSON.stringify(mark),
                'EX',
                DEAL_MOVEMENT_TTL_SEC.periodDigest,
            );
    }
}
