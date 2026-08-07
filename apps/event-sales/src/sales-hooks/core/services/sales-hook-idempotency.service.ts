import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { RedisService } from '@/core/redis/redis.service';
import { AppCacheService } from '@lib/app-cache';
import {
    SALES_HOOK_ALIAS_TTL_SECONDS,
    SALES_HOOK_CACHE_APP,
    SALES_HOOK_DEDUPE_TTL_SECONDS,
    SALES_HOOK_LOCK_TTL_MS,
} from '../constants/sales-hook.const';
import { EnumSalesHookCode } from '../constants/sales-hook-code.enum';

/**
 * Идемпотентность каркаса без новых таблиц:
 *  - Redis NX-lock — взаимное исключение (кнопка × робот по одной сущности);
 *  - `seen:{fingerprint}` в app-cache — повтор робота вне окна тишины;
 *  - `op-alias:...` в app-cache — схлопывание двойного клика без operationId.
 *
 * Это ВСПОМОГАТЕЛЬНЫЕ слои: главный слой — доменная идемпотентность в самих
 * use-case-ах (перечитывание состояния в Битриксе перед записью).
 */
@Injectable()
export class SalesHookIdempotencyService {
    constructor(
        private readonly redisService: RedisService,
        private readonly appCache: AppCacheService,
    ) {}

    /**
     * Детерминированный отпечаток элемента: hook + сущность + нормализованные
     * бизнес-параметры (ключи сортируются перед сериализацией).
     */
    fingerprint(
        hook: EnumSalesHookCode,
        entityKey: string,
        params: Record<string, unknown> = {},
    ): string {
        const sorted = Object.keys(params)
            .sort()
            .map(key => `${key}=${JSON.stringify(params[key])}`)
            .join('&');
        return createHash('md5')
            .update(`${hook}|${entityKey}|${sorted}`)
            .digest('hex');
    }

    /** Redis NX-замок на сущность. true — замок взят, false — занят. */
    async acquireLock(
        domain: string,
        hook: EnumSalesHookCode,
        entityKey: string,
    ): Promise<boolean> {
        const redis = this.redisService.getClient();
        const wasSet = await redis.set(
            this.lockKey(domain, hook, entityKey),
            '1',
            'PX',
            SALES_HOOK_LOCK_TTL_MS,
            'NX',
        );
        return wasSet === 'OK';
    }

    async releaseLock(
        domain: string,
        hook: EnumSalesHookCode,
        entityKey: string,
    ): Promise<void> {
        const redis = this.redisService.getClient();
        await redis.del(this.lockKey(domain, hook, entityKey));
    }

    /**
     * Был ли элемент с таким отпечатком уже принят недавно (повтор робота).
     * Возвращает operationId принявшей операции либо null.
     */
    async getSeenOperationId(
        domain: string,
        fingerprint: string,
    ): Promise<string | null> {
        const seen = await this.appCache.get<{ operationId: string }>({
            app: SALES_HOOK_CACHE_APP,
            domain,
            key: `seen:${fingerprint}`,
        });
        return seen?.operationId ?? null;
    }

    /** Помечает отпечаток принятым — вызывается ПОСЛЕ успешной постановки. */
    async markSeen(
        domain: string,
        fingerprint: string,
        operationId: string,
    ): Promise<void> {
        await this.appCache.set({
            app: SALES_HOOK_CACHE_APP,
            domain,
            key: `seen:${fingerprint}`,
            group: 'dedupe',
            data: { operationId },
            ttlSeconds: SALES_HOOK_DEDUPE_TTL_SECONDS,
        });
    }

    /**
     * Alias двойного клика: фронт не прислал operationId — по (hook, сущность,
     * пользователь) вспоминаем operationId недавней операции.
     */
    async getAliasOperationId(
        domain: string,
        hook: EnumSalesHookCode,
        entityKey: string,
        bxUserId?: number,
    ): Promise<string | null> {
        const alias = await this.appCache.get<{ operationId: string }>({
            app: SALES_HOOK_CACHE_APP,
            domain,
            key: this.aliasKey(hook, entityKey, bxUserId),
        });
        return alias?.operationId ?? null;
    }

    async setAliasOperationId(
        domain: string,
        hook: EnumSalesHookCode,
        entityKey: string,
        operationId: string,
        bxUserId?: number,
    ): Promise<void> {
        await this.appCache.set({
            app: SALES_HOOK_CACHE_APP,
            domain,
            key: this.aliasKey(hook, entityKey, bxUserId),
            group: 'dedupe',
            data: { operationId },
            ttlSeconds: SALES_HOOK_ALIAS_TTL_SECONDS,
        });
    }

    private lockKey(
        domain: string,
        hook: EnumSalesHookCode,
        entityKey: string,
    ): string {
        return `sales_hook_lock:${domain}:${hook}:${entityKey}`;
    }

    private aliasKey(
        hook: EnumSalesHookCode,
        entityKey: string,
        bxUserId?: number,
    ): string {
        return `op-alias:${hook}:${entityKey}:${bxUserId ?? 'anon'}`;
    }
}
