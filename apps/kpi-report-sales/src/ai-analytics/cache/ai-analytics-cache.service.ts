import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { AI_ANALYTICS_CACHE_PREFIX } from '../constants/ai-analytics.const';

/**
 * Кэш модуля ai-analytics поверх центрального AppCache (Redis + app_cache
 * в MySQL, write-through) — по образцу sales-finance-cache.service.ts.
 *
 * Ключи строит cache-key.util.ts (`sales-ai-analytics:v1:{domain}:{section}:...`);
 * адаптер разбирает ключ на адрес AppCache: app = префикс, domain,
 * key = '{section}:...', group = section. Ключи вне схемы игнорируются.
 */
@Injectable()
export class AiAnalyticsCacheService {
    private readonly logger = new Logger(AiAnalyticsCacheService.name);

    constructor(private readonly appCache: AppCacheService) {}

    async getJson<T>(key: string): Promise<T | null> {
        const ref = this.parseKey(key);
        if (!ref) return null;
        return this.appCache.get<T>({
            app: AI_ANALYTICS_CACHE_PREFIX,
            domain: ref.domain,
            key: ref.key,
        });
    }

    async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
        const ref = this.parseKey(key);
        if (!ref) return;
        await this.appCache.set({
            app: AI_ANALYTICS_CACHE_PREFIX,
            domain: ref.domain,
            key: ref.key,
            group: ref.section,
            data: value,
            ttlSeconds,
        });
        this.logger.debug(`Записан кэш ${key} (TTL ${ttlSeconds}s)`);
    }

    /**
     * Чтение с вычислением при промахе (fail-open на записи: ошибка кэша
     * не должна ронять ответ — значение уже посчитано).
     */
    async remember<T>(
        key: string,
        ttlSeconds: number,
        compute: () => Promise<T>,
    ): Promise<{ value: T; fromCache: boolean }> {
        const cached = await this.getJson<T>(key);
        if (cached !== null) return { value: cached, fromCache: true };
        const value = await compute();
        try {
            await this.setJson(key, value, ttlSeconds);
        } catch (error) {
            this.logger.warn(
                `Кэш ${key} не записан: ${(error as Error).message}`,
            );
        }
        return { value, fromCache: false };
    }

    /** Сброс по SCAN-паттерну `sales-ai-analytics:v1:{domain}:{section}:*`. */
    async resetByPattern(pattern: string): Promise<number> {
        const withoutStar = pattern.replace(/\*+$/, '');
        const ref = this.parseKey(withoutStar);
        if (!ref) return 0;
        const { deletedDb, deletedRedis } = await this.appCache.reset({
            app: AI_ANALYTICS_CACHE_PREFIX,
            domain: ref.domain,
            ...(ref.key ? { keyPrefix: ref.key } : {}),
        });
        this.logger.log(
            `Сброшен кэш по паттерну ${pattern}: БД ${deletedDb}, Redis ${deletedRedis}`,
        );
        return deletedDb;
    }

    /** `sales-ai-analytics:v1:{domain}:{rest}` → адрес AppCache; чужой ключ → null. */
    private parseKey(
        fullKey: string,
    ): { domain: string; key: string; section?: string } | null {
        const prefix = `${AI_ANALYTICS_CACHE_PREFIX}:`;
        if (!fullKey.startsWith(prefix)) {
            this.logger.warn(`Ключ вне схемы ai-analytics: ${fullKey}`);
            return null;
        }
        const rest = fullKey.slice(prefix.length);
        const sep = rest.indexOf(':');
        if (sep <= 0) {
            return { domain: rest.replace(/:$/, ''), key: '' };
        }
        const domain = rest.slice(0, sep);
        const key = rest.slice(sep + 1).replace(/:$/, '');
        const section = key.split(':')[0] || undefined;
        return { domain, key, section };
    }
}
