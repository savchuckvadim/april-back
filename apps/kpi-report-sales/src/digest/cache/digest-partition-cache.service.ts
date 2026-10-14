import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import type { IsoDate } from '../../shared/lib/month-segments.util';
import { KPI_DIGEST_CACHE_APP } from '../constants/digest.const';
import { buildDigestDayKeyPrefixes } from './digest-cache-key.util';

/**
 * Партиции дня дайджеста поверх центрального AppCache (Redis + app_cache
 * в MySQL; инспекция — POST /app-cache/list { app: 'kpi-digest' }).
 *
 * Запись — write-through и некритична: ошибка кэша логируется, значение
 * уже посчитано и уходит клиенту. @Injectable без bitrix-состояния.
 */
@Injectable()
export class DigestPartitionCacheService {
    private readonly logger = new Logger(DigestPartitionCacheService.name);

    constructor(private readonly appCache: AppCacheService) {}

    async get<T>(domain: string, key: string): Promise<T | null> {
        return this.appCache.get<T>({
            app: KPI_DIGEST_CACHE_APP,
            domain,
            key,
        });
    }

    async set(
        domain: string,
        key: string,
        data: unknown,
        ttlSeconds: number,
        group: string,
    ): Promise<void> {
        try {
            await this.appCache.set({
                app: KPI_DIGEST_CACHE_APP,
                domain,
                key,
                data,
                ttlSeconds,
                group,
            });
        } catch (error) {
            this.logger.warn(
                `[${domain}] партиция ${key} не записана в кэш: ${
                    (error as Error).message
                }`,
            );
        }
    }

    /** Сброс: все партиции домена либо только партиции одного дня. */
    async reset(
        domain: string,
        date?: IsoDate,
    ): Promise<{ deletedDb: number; deletedRedis: number }> {
        if (!date) {
            const res = await this.appCache.reset({
                app: KPI_DIGEST_CACHE_APP,
                domain,
            });
            return { deletedDb: res.deletedDb, deletedRedis: res.deletedRedis };
        }
        let deletedDb = 0;
        let deletedRedis = 0;
        for (const keyPrefix of buildDigestDayKeyPrefixes(date)) {
            const res = await this.appCache.reset({
                app: KPI_DIGEST_CACHE_APP,
                domain,
                keyPrefix,
            });
            deletedDb += res.deletedDb;
            deletedRedis += res.deletedRedis;
        }
        return { deletedDb, deletedRedis };
    }
}
