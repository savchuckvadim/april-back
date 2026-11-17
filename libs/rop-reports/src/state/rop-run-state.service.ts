import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { getErrorString } from '@lib/shared/lib/utils/get-error-string.util';
import {
    parseRopRunSummary,
    ROP_RUN_SUMMARY_MAX_WARNINGS,
    RopRunSummary,
} from './rop-run-summary';

/** Снять замок, только если он ещё наш: истёкший мог взять другой прогон. */
const RELEASE_SCRIPT =
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
/** Продлить замок, только если он ещё наш. */
const EXTEND_SCRIPT =
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end";

/** Неудачи периода: сколько попыток и за какой период. */
export interface RopFailureCount {
    readonly periodKey: string;
    readonly attempt: number;
}

/**
 * Состояние прогонов отчётов РОПу в Redis: замки с токеном владельца,
 * метки выпуска периода, счётчик неудачных попыток и итог последнего
 * прогона. Обобщение состояния отчёта по дублям: ключи приходят от
 * вызывающего (`RopReportKeys`), сервис один на все отчёты.
 *
 * Сбой Redis на чтении — «метки нет», на записи — тихо (в журнал):
 * лучше лишний прогон, чем потерянный период. Только Redis, без Битрикса.
 */
@Injectable()
export class RopRunStateService {
    private readonly logger = new Logger(RopRunStateService.name);

    constructor(private readonly redisService: RedisService) {}

    /** Токен замка; null — замок занят или Redis недоступен. */
    async lock(key: string, ttlSec: number): Promise<string | null> {
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

    /** Продлить свой замок: долгий прогон не должен его потерять. */
    async extend(key: string, token: string, ttlSec: number): Promise<void> {
        await this.redis()
            .eval(EXTEND_SCRIPT, 1, key, token, String(ttlSec))
            .catch(() => undefined);
    }

    /** Снять свой замок; чужой не трогается. */
    async unlock(key: string, token: string): Promise<void> {
        await this.redis()
            .eval(RELEASE_SCRIPT, 1, key, token)
            .catch(() => undefined);
    }

    /** Занят ли замок — для состояния в админке; сбой Redis — «свободен». */
    async isLocked(key: string): Promise<boolean> {
        const count = await this.redis()
            .exists(key)
            .catch(() => 0);
        return count > 0;
    }

    /** Ключ периода, который уже выпущен; null — не выпущен или Redis молчит. */
    async released(key: string): Promise<string | null> {
        return this.redis()
            .get(key)
            .catch(() => null);
    }

    async markReleased(
        key: string,
        periodKey: string,
        ttlSec: number,
    ): Promise<void> {
        await this.redis()
            .set(key, periodKey, 'EX', ttlSec)
            .catch((error: unknown) =>
                this.logger.warn(
                    `Метка выпуска ${key} не записана: ${getErrorString(error)}`,
                ),
            );
    }

    /**
     * Неудачная попытка периода; возвращает её номер (1 — первая). Другой
     * период начинает счёт заново.
     */
    async registerFailure(
        key: string,
        periodKey: string,
        ttlSec: number,
    ): Promise<number> {
        const previous = await this.failures(key);
        const attempt =
            previous?.periodKey === periodKey ? previous.attempt + 1 : 1;
        await this.redis()
            .set(key, `${periodKey}:${attempt}`, 'EX', ttlSec)
            .catch(() => undefined);
        return attempt;
    }

    /** Текущий счётчик неудач; нет или битый — null. */
    async failures(key: string): Promise<RopFailureCount | null> {
        const raw = await this.redis()
            .get(key)
            .catch(() => null);
        if (!raw) return null;
        const split = raw.lastIndexOf(':');
        const attempt = Number(raw.slice(split + 1));
        if (split <= 0 || !Number.isInteger(attempt) || attempt < 1) {
            return null;
        }
        return { periodKey: raw.slice(0, split), attempt };
    }

    async clearFailures(key: string): Promise<void> {
        await this.redis()
            .del(key)
            .catch(() => undefined);
    }

    /** Итог последнего прогона (предупреждения — первые десять). */
    async saveLastRun(
        key: string,
        summary: RopRunSummary,
        ttlSec: number,
    ): Promise<void> {
        const stored: RopRunSummary = {
            ...summary,
            warnings: summary.warnings.slice(0, ROP_RUN_SUMMARY_MAX_WARNINGS),
        };
        await this.redis()
            .set(key, JSON.stringify(stored), 'EX', ttlSec)
            .catch((error: unknown) =>
                this.logger.warn(
                    `Итог прогона ${key} не записан: ${getErrorString(error)}`,
                ),
            );
    }

    async lastRun(key: string): Promise<RopRunSummary | null> {
        const raw = await this.redis()
            .get(key)
            .catch(() => null);
        return parseRopRunSummary(raw);
    }

    private redis() {
        return this.redisService.getClient();
    }
}
