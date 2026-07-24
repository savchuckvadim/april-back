import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { SALES_FINANCE_CACHE_PREFIX } from '../constants/sales-finance.const';

/**
 * Кэш модуля sales-finance поверх центрального AppCache (Redis + app_cache
 * в MySQL): write-through, переживает перезагрузку Redis, виден в инспекции
 * POST /app-cache/list (app = 'sales-finance').
 *
 * API и схема ключей прежние (строит cache-key.util.ts:
 * `sales-finance:{domain}:{section}:...`) — адаптер разбирает ключ на адрес
 * AppCache: app='sales-finance', domain, key='{section}:...', group=section.
 * Call-sites (use-case'ы, контроллер) не изменились.
 */
@Injectable()
export class SalesFinanceCacheService {
    private readonly logger = new Logger(SalesFinanceCacheService.name);

    constructor(private readonly appCache: AppCacheService) {}

    async getJson<T>(key: string): Promise<T | null> {
        const ref = this.parseKey(key);
        if (!ref) return null;
        return this.appCache.get<T>({
            app: SALES_FINANCE_CACHE_PREFIX,
            domain: ref.domain,
            key: ref.key,
        });
    }

    async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
        const ref = this.parseKey(key);
        if (!ref) return;
        await this.appCache.set({
            app: SALES_FINANCE_CACHE_PREFIX,
            domain: ref.domain,
            key: ref.key,
            group: ref.section,
            data: value,
            ttlSeconds,
        });
        this.logger.debug(`Записан кэш ${key} (TTL ${ttlSeconds}s)`);
    }

    /**
     * Сброс по прежнему SCAN-паттерну `sales-finance:{domain}:{section}:*`.
     * Возвращает число удалённых записей (по строкам БД).
     */
    async resetByPattern(pattern: string): Promise<number> {
        const withoutStar = pattern.replace(/\*+$/, '');
        const ref = this.parseKey(withoutStar);
        if (!ref) return 0;

        const { deletedDb, deletedRedis } = await this.appCache.reset({
            app: SALES_FINANCE_CACHE_PREFIX,
            domain: ref.domain,
            ...(ref.key ? { keyPrefix: ref.key } : {}),
        });
        this.logger.log(
            `Сброшен кэш по паттерну ${pattern}: БД ${deletedDb}, Redis ${deletedRedis}`,
        );
        return deletedDb;
    }

    /** `sales-finance:{domain}:{rest}` → адрес AppCache; чужой ключ → null. */
    private parseKey(
        fullKey: string,
    ): { domain: string; key: string; section?: string } | null {
        const prefix = `${SALES_FINANCE_CACHE_PREFIX}:`;
        if (!fullKey.startsWith(prefix)) {
            this.logger.warn(`Ключ вне схемы sales-finance: ${fullKey}`);
            return null;
        }
        const rest = fullKey.slice(prefix.length);
        const sep = rest.indexOf(':');
        if (sep <= 0) {
            // только домен (паттерн сброса всего портала)
            return { domain: rest.replace(/:$/, ''), key: '' };
        }
        const domain = rest.slice(0, sep);
        const key = rest.slice(sep + 1).replace(/:$/, '');
        const section = key.split(':')[0] || undefined;
        return { domain, key, section };
    }
}
