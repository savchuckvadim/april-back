import { Injectable } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    DEAL_MOVEMENT_REDIS_KEYS,
    type DealMovementStateEntry,
} from '@lib/sales-ai-analytics';
import { DEAL_MOVEMENT_TTL_SEC } from '../constants/deal-movement.const';
import {
    decodeDealMovementEntry,
    encodeDealMovementEntry,
} from '../lib/deal-movement-state.codec';

/** Полей в одной команде HSET: тысячи сделок не уходят одним пакетом. */
const FIELDS_PER_COMMAND = 500;

/**
 * Состояние по сделкам — Redis-хеш `state:{домен}` (поле — id сделки,
 * значение — запись), 7 суток, продлевается каждым счётом (решение
 * 17.11.2026). Полного состояния в ais нет: на garant это мегабайты на
 * запись. Потеря Redis = новая базовая линия, это приемлемо.
 *
 * Запись атомарна для читателя: новое состояние целиком пишется в черновик
 * и подменяет прошлое одной командой RENAME — полузаписанного хеша никто
 * не увидит. Закрытые сделки выпадают сами: их нет в новом состоянии.
 *
 * `@Injectable` без bitrix-состояния: только Redis.
 */
@Injectable()
export class DealMovementStateStore {
    constructor(private readonly redisService: RedisService) {}

    /** Прошлое состояние портала; битые записи пропускаются. */
    async load(domain: string): Promise<Map<string, DealMovementStateEntry>> {
        const raw = await this.redisService
            .getClient()
            .hgetall(DEAL_MOVEMENT_REDIS_KEYS.state(domain));
        const state = new Map<string, DealMovementStateEntry>();
        for (const [dealId, value] of Object.entries(raw ?? {})) {
            const entry = decodeDealMovementEntry(value);
            if (entry !== null) state.set(dealId, entry);
        }
        return state;
    }

    async save(
        domain: string,
        state: ReadonlyMap<string, DealMovementStateEntry>,
    ): Promise<void> {
        const redis = this.redisService.getClient();
        const key = DEAL_MOVEMENT_REDIS_KEYS.state(domain);
        const draft = DEAL_MOVEMENT_REDIS_KEYS.stateDraft(domain);
        if (state.size === 0) {
            await redis.del(key);
            return;
        }
        await redis.del(draft);
        const entries = [...state.entries()];
        for (
            let start = 0;
            start < entries.length;
            start += FIELDS_PER_COMMAND
        ) {
            const fields: Record<string, string> = {};
            for (const [dealId, entry] of entries.slice(
                start,
                start + FIELDS_PER_COMMAND,
            )) {
                fields[dealId] = encodeDealMovementEntry(entry);
            }
            await redis.hset(draft, fields);
        }
        await redis.rename(draft, key);
        await redis.expire(key, DEAL_MOVEMENT_TTL_SEC.state);
    }
}
