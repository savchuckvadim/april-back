import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    DEAL_MOVEMENT_REDIS_KEYS,
    isDealMovementRunStatusLike,
    type DealMovementRunStatus,
} from '@lib/sales-ai-analytics';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import { DEAL_MOVEMENT_TTL_SEC } from '../constants/deal-movement.const';
import {
    parseDealMovementLastRun,
    type DealMovementLastRun,
} from '../lib/deal-movement-schedule';

/** Снять замок, только если он ещё наш: истёкший мог взять другой прогон. */
const RELEASE_SCRIPT =
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
/** Продлить замок, только если он ещё наш. */
const EXTEND_SCRIPT =
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end";

/**
 * Служебное состояние прогонов в Redis: замки (тика и портала — общий у
 * крона и ручного прогона, с токеном владельца, как у отчёта по дублям),
 * ход и итог последнего прогона, метка последнего сохранённого счёта.
 *
 * Сбой Redis на чтении — «метки нет», на записи хода — тихо: ход прогона
 * вторичен, сам счёт от него не зависит.
 *
 * `@Injectable` без bitrix-состояния: только Redis.
 */
@Injectable()
export class DealMovementRunState {
    private readonly logger = new Logger(DealMovementRunState.name);

    constructor(private readonly redisService: RedisService) {}

    /** Замок тика; null — идёт другой тик или Redis недоступен. */
    lockTick(): Promise<string | null> {
        return this.take(
            DEAL_MOVEMENT_REDIS_KEYS.tickLock,
            DEAL_MOVEMENT_TTL_SEC.tickLock,
        );
    }

    unlockTick(token: string): Promise<void> {
        return this.release(DEAL_MOVEMENT_REDIS_KEYS.tickLock, token);
    }

    /** Замок портала; null — портал уже считается (крон или админка). */
    lock(domain: string): Promise<string | null> {
        return this.take(
            DEAL_MOVEMENT_REDIS_KEYS.lock(domain),
            DEAL_MOVEMENT_TTL_SEC.lock,
        );
    }

    /** Продлить замок портала между фазами долгого прогона. */
    async extend(domain: string, token: string): Promise<void> {
        await this.redis()
            .eval(
                EXTEND_SCRIPT,
                1,
                DEAL_MOVEMENT_REDIS_KEYS.lock(domain),
                token,
                String(DEAL_MOVEMENT_TTL_SEC.lock),
            )
            .catch(() => undefined);
    }

    unlock(domain: string, token: string): Promise<void> {
        return this.release(DEAL_MOVEMENT_REDIS_KEYS.lock(domain), token);
    }

    async saveStatus(status: DealMovementRunStatus): Promise<void> {
        await this.redis()
            .set(
                DEAL_MOVEMENT_REDIS_KEYS.status(status.domain),
                JSON.stringify(status),
                'EX',
                DEAL_MOVEMENT_TTL_SEC.status,
            )
            .catch((error: unknown) =>
                this.logger.warn(
                    `Ход движения сделок ${status.domain} не сохранён: ${getErrorString(error)}`,
                ),
            );
    }

    async loadStatus(domain: string): Promise<DealMovementRunStatus | null> {
        const raw = await this.redis()
            .get(DEAL_MOVEMENT_REDIS_KEYS.status(domain))
            .catch(() => null);
        if (!raw) return null;
        try {
            const value: unknown = JSON.parse(raw);
            return isDealMovementRunStatusLike(value) ? value : null;
        } catch {
            return null;
        }
    }

    async lastRun(domain: string): Promise<DealMovementLastRun | null> {
        const raw = await this.redis()
            .get(DEAL_MOVEMENT_REDIS_KEYS.lastRun(domain))
            .catch(() => null);
        return parseDealMovementLastRun(raw);
    }

    /** Отметить сохранённый счёт: метка ошибкой не считается — бросаем. */
    async markRun(domain: string, run: DealMovementLastRun): Promise<void> {
        await this.redis().set(
            DEAL_MOVEMENT_REDIS_KEYS.lastRun(domain),
            JSON.stringify(run),
            'EX',
            DEAL_MOVEMENT_TTL_SEC.lastRun,
        );
    }

    private async take(key: string, ttlSec: number): Promise<string | null> {
        const token = `${process.pid}:${randomUUID()}`;
        const locked = await this.redis()
            .set(key, token, 'EX', ttlSec, 'NX')
            .catch((error: unknown) => {
                this.logger.error(
                    `Замок ${key} не взят: ${getErrorString(error)}`,
                );
                return null;
            });
        return locked ? token : null;
    }

    private async release(key: string, token: string): Promise<void> {
        await this.redis()
            .eval(RELEASE_SCRIPT, 1, key, token)
            .catch(() => undefined);
    }

    private redis() {
        return this.redisService.getClient();
    }
}
