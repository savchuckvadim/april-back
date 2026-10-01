import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    buildDuplicateReportFailKey,
    buildDuplicateReportWeekKey,
    DUPLICATE_REPORT_LOCK_KEY,
    DUPLICATE_REPORT_LOCK_TTL_SEC,
    DUPLICATE_REPORT_WEEK_TTL_SEC,
} from '../constants/duplicate-report.const';

/** Снять лок, только если он ещё наш: истёкший лок мог взять другой прогон. */
const RELEASE_SCRIPT =
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
/** Продлить лок, только если он ещё наш. */
const EXTEND_SCRIPT =
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end";

/**
 * Состояние прогонов отчёта по дублям в Redis: лок от наложения крона и
 * ручного прогона, метки «неделя отправлена» и счётчик неудачных попыток.
 *
 * Лок — с токеном владельца: снять или продлить его может только тот, кто
 * взял (прогон дольше TTL не снесёт лок следующего). Сбой Redis на чтении —
 * «метки нет», на записи — тихо: лучше лишний прогон, чем потерянная неделя.
 */
@Injectable()
export class DuplicateReportRunState {
    private readonly logger = new Logger(DuplicateReportRunState.name);

    constructor(private readonly redisService: RedisService) {}

    /** Токен лока; null — лок занят или Redis недоступен (прогона нет). */
    async lock(): Promise<string | null> {
        const token = `${process.pid}:${randomUUID()}`;
        const locked = await this.redis()
            .set(
                DUPLICATE_REPORT_LOCK_KEY,
                token,
                'EX',
                DUPLICATE_REPORT_LOCK_TTL_SEC,
                'NX',
            )
            .catch((error: unknown) => {
                this.logger.error(
                    `Лок отчёта по дублям не взят: ${getErrorString(error)}`,
                );
                return null;
            });
        return locked ? token : null;
    }

    /** Продлить лок перед очередным порталом: тик по многим порталам долог. */
    async extend(token: string): Promise<void> {
        await this.redis()
            .eval(
                EXTEND_SCRIPT,
                1,
                DUPLICATE_REPORT_LOCK_KEY,
                token,
                String(DUPLICATE_REPORT_LOCK_TTL_SEC),
            )
            .catch(() => undefined);
    }

    async unlock(token: string): Promise<void> {
        await this.redis()
            .eval(RELEASE_SCRIPT, 1, DUPLICATE_REPORT_LOCK_KEY, token)
            .catch(() => undefined);
    }

    /** Неделя, за которую отчёт уже ушёл (своя метка у «только считать»). */
    async lastWeek(domain: string, countOnly: boolean): Promise<string | null> {
        return this.redis()
            .get(buildDuplicateReportWeekKey(domain, countOnly))
            .catch(() => null);
    }

    async markWeek(
        domain: string,
        week: string,
        countOnly: boolean,
    ): Promise<void> {
        await this.redis()
            .set(
                buildDuplicateReportWeekKey(domain, countOnly),
                week,
                'EX',
                DUPLICATE_REPORT_WEEK_TTL_SEC,
            )
            .catch(() => undefined);
    }

    /** Неудачная попытка недели; возвращает её номер (1 — первая). */
    async registerFailure(domain: string, week: string): Promise<number> {
        const key = buildDuplicateReportFailKey(domain);
        const raw = await this.redis()
            .get(key)
            .catch(() => null);
        const [lastWeek, count] = String(raw ?? '').split(':');
        const attempt = lastWeek === week ? (Number(count) || 0) + 1 : 1;
        await this.redis()
            .set(key, `${week}:${attempt}`, 'EX', DUPLICATE_REPORT_WEEK_TTL_SEC)
            .catch(() => undefined);
        return attempt;
    }

    async clearFailures(domain: string): Promise<void> {
        await this.redis()
            .del(buildDuplicateReportFailKey(domain))
            .catch(() => undefined);
    }

    private redis() {
        return this.redisService.getClient();
    }
}
