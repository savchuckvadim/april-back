import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    CallReportAnalyticsKind,
    CallReportAnalyticsQueryDto,
} from '../dto/call-report-analytics-query.dto';

/** Префикс всех ключей кэша модуля (по нему же работает сброс). */
const CACHE_PREFIX = 'call-report:analytics';

/** TTL кэша отчётов по умолчанию, сек (env CALL_REPORT_ANALYTICS_CACHE_TTL_SEC). */
const DEFAULT_TTL_SEC = 3600;

/**
 * Redis-кэш построенных отчётов.
 *
 * Ключ: call-report:analytics:{вид}:{домен}:{sha256(параметры)} — одинаковые
 * параметры запроса дают одинаковый ключ; флаги useCache/saveToHistory в
 * ключ НЕ входят (не влияют на содержимое отчёта).
 *
 * Сброс — по шаблону: весь модуль / вид отчёта / домен (endpoint
 * POST /call-report/analytics/cache/reset).
 *
 * Отказоустойчивость: любые ошибки Redis логируются и НЕ роняют отчёт —
 * при недоступном кэше отчёт просто пересчитывается.
 */
@Injectable()
export class CallReportAnalyticsCacheService {
    private readonly logger = new Logger(CallReportAnalyticsCacheService.name);
    private readonly ttlSec: number;

    constructor(
        private readonly redisService: RedisService,
        configService: ConfigService,
    ) {
        const raw = configService.get<string>(
            'CALL_REPORT_ANALYTICS_CACHE_TTL_SEC',
        );
        const parsed = raw ? Number.parseInt(raw, 10) : NaN;
        this.ttlSec =
            Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SEC;
    }

    /** Детерминированный ключ кэша по параметрам отчёта. */
    buildKey(
        kind: CallReportAnalyticsKind,
        query: CallReportAnalyticsQueryDto,
    ): string {
        const paramsHash = createHash('sha256')
            .update(
                JSON.stringify({
                    from: query.from,
                    to: query.to,
                    managerId: query.managerId ?? null,
                    minDurationSec: query.minDurationSec ?? null,
                    maxDurationSec: query.maxDurationSec ?? null,
                    callType: query.callType ?? null,
                }),
            )
            .digest('hex')
            .slice(0, 16);
        return `${CACHE_PREFIX}:${kind}:${query.domain}:${paramsHash}`;
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            const raw = await this.redisService.getClient().get(key);
            if (!raw) {
                this.logger.log(`Кэш-промах: ${key}`);
                return null;
            }
            this.logger.log(`Кэш-попадание: ${key}`);
            return JSON.parse(raw) as T;
        } catch (error) {
            this.logger.warn(
                `Кэш недоступен на чтение (${key}): ${(error as Error).message}`,
            );
            return null;
        }
    }

    async set(key: string, value: unknown): Promise<void> {
        try {
            await this.redisService
                .getClient()
                .set(key, JSON.stringify(value), 'EX', this.ttlSec);
            this.logger.log(`Кэш записан: ${key} (TTL ${this.ttlSec}с)`);
        } catch (error) {
            this.logger.warn(
                `Кэш недоступен на запись (${key}): ${(error as Error).message}`,
            );
        }
    }

    /**
     * Сброс кэша по фильтрам: report и/или domain; без фильтров — весь
     * кэш модуля. Возвращает число удалённых ключей и шаблон.
     */
    async reset(options: {
        report?: CallReportAnalyticsKind;
        domain?: string;
    }): Promise<{ removedKeys: number; pattern: string }> {
        const pattern = `${CACHE_PREFIX}:${options.report ?? '*'}:${options.domain ?? '*'}:*`;
        const client = this.redisService.getClient();
        let removedKeys = 0;
        let cursor = '0';
        try {
            do {
                const [nextCursor, keys] = await client.scan(
                    cursor,
                    'MATCH',
                    pattern,
                    'COUNT',
                    200,
                );
                cursor = nextCursor;
                if (keys.length) {
                    removedKeys += await client.del(...keys);
                }
            } while (cursor !== '0');
        } catch (error) {
            this.logger.warn(
                `Сброс кэша не завершён (${pattern}): ${(error as Error).message}`,
            );
        }
        this.logger.log(`Сброс кэша: ${pattern} → удалено ${removedKeys}`);
        return { removedKeys, pattern };
    }
}
