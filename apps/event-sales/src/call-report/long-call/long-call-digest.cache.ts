import { createHash } from 'node:crypto';
import { RedisJsonCache } from '@lib/core/redis/redis-json-cache';
import type { RedisService } from '@lib/core/redis/redis.service';
import { CALL_LONG_PART_SCHEMA_NAME } from '../contracts/call-long-part.contract';
import { CALL_LONG_SUMMARY_SCHEMA_NAME } from '../contracts/call-long-summary.contract';
import {
    LONG_CALL_CACHE_KEY_PREFIX,
    LONG_CALL_CACHE_KEY_SEPARATOR,
    LONG_CALL_CACHE_TTL_SEC,
} from './long-call-service.const';
import { isRecord } from './long-call-parse.util';

/**
 * Кэш ответов модели по длинному разговору: конспект части и сводка. Повторный
 * разбор того же звонка (страховка, догон, переразбор) берёт готовые ответы
 * из Redis и не платит за них заново.
 *
 * Кладём сырой ответ модели, а не разобранный: разбор (чистка, пределы) идёт
 * заново при чтении, и правка правил чистки не оставляет в кэше устаревшего.
 * В кэш попадают только ответы, которые разобрались и не «подозрительно
 * пусты» — это решает вызывающий.
 *
 * Сбой Redis кэш не замечает (RedisJsonCache не бросает): запрос идёт к модели.
 */

/** Роли запросов, которые кэшируются: имя схемы ответа. */
export type LongCallCacheRole =
    | typeof CALL_LONG_PART_SCHEMA_NAME
    | typeof CALL_LONG_SUMMARY_SCHEMA_NAME;

/** Что определяет ответ модели: роль, модель и оба текста задания. */
export interface LongCallCacheRequest {
    role: LongCallCacheRole;
    /** Модель из настроек портала; не задана — модель по умолчанию. */
    model: string | undefined;
    system: string;
    user: string;
}

/** Сырой ответ модели, который разобрался (объект). */
export type LongCallCachedAnswer = Record<string, unknown>;

/**
 * Ключ записи: sha1 от роли, модели и текстов задания. Домен портала в ключ
 * не входит — одинаковый текст даёт одинаковый конспект у любого портала.
 */
export function longCallCacheKey(request: LongCallCacheRequest): string {
    const digest = createHash('sha1')
        .update(
            [
                request.role,
                request.model ?? '',
                request.system,
                request.user,
            ].join(LONG_CALL_CACHE_KEY_SEPARATOR),
        )
        .digest('hex');

    return `${LONG_CALL_CACHE_KEY_PREFIX}:${request.role}:${digest}`;
}

const isCachedAnswer = (value: unknown): value is LongCallCachedAnswer =>
    isRecord(value);

/** Два кэша (конспект части и сводка) на одном Redis; без Redis — всегда пусто. */
export class LongCallDigestCache {
    private readonly byRole: Record<
        LongCallCacheRole,
        RedisJsonCache<LongCallCachedAnswer>
    >;

    constructor(redis: RedisService | undefined) {
        const cacheOf = (
            role: LongCallCacheRole,
        ): RedisJsonCache<LongCallCachedAnswer> =>
            new RedisJsonCache<LongCallCachedAnswer>(redis, {
                name: `long-call:${role}`,
                ttlSec: LONG_CALL_CACHE_TTL_SEC,
                guard: isCachedAnswer,
            });
        this.byRole = {
            [CALL_LONG_PART_SCHEMA_NAME]: cacheOf(CALL_LONG_PART_SCHEMA_NAME),
            [CALL_LONG_SUMMARY_SCHEMA_NAME]: cacheOf(
                CALL_LONG_SUMMARY_SCHEMA_NAME,
            ),
        };
    }

    /** Ответ из кэша; записи нет или Redis недоступен — undefined. */
    get(
        request: LongCallCacheRequest,
    ): Promise<LongCallCachedAnswer | undefined> {
        return this.byRole[request.role].get(longCallCacheKey(request));
    }

    /** Кладёт ответ на сутки; сбой записи молчит. */
    set(
        request: LongCallCacheRequest,
        answer: LongCallCachedAnswer,
    ): Promise<void> {
        return this.byRole[request.role].set(longCallCacheKey(request), answer);
    }
}
