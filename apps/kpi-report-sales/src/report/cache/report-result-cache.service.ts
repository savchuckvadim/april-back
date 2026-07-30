import { Injectable } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';

/**
 * Конверт результата отчёта в кэше: ready с данными или error с причиной.
 * error-конверт (короткий TTL) нужен поллингу — иначе упавший job оставил
 * бы клиента в вечном 'queued'.
 */
export type ReportResultEnvelope<T> =
    | { status: 'ready'; data: T; generatedAt: string }
    | { status: 'error'; message: string; generatedAt: string };

/**
 * Универсальный кэш конвертов отчётных результатов поверх центрального
 * AppCache (Redis + MySQL, write-through). Используется обоими тяжёлыми
 * эндпоинтами report-модуля (kpi-report/get и calling-statistic) —
 * пространства разводятся параметром app. Изоляция порталов — domain
 * в каждом ключе AppCache.
 *
 * @Injectable без bitrix-состояния; в share-link-снапшоте создаётся
 * вручную `new ReportResultCacheService(appCache)` (прецедент —
 * SalesFinanceCacheService).
 */
@Injectable()
export class ReportResultCacheService {
    constructor(private readonly appCache: AppCacheService) {}

    async getEnvelope<T>(
        app: string,
        domain: string,
        key: string,
    ): Promise<ReportResultEnvelope<T> | null> {
        return this.appCache.get<ReportResultEnvelope<T>>({
            app,
            domain,
            key,
        });
    }

    async setReady<T>(
        app: string,
        domain: string,
        key: string,
        data: T,
        ttlSeconds: number,
    ): Promise<void> {
        const envelope: ReportResultEnvelope<T> = {
            status: 'ready',
            data,
            generatedAt: new Date().toISOString(),
        };
        await this.appCache.set({
            app,
            domain,
            key,
            group: 'result',
            data: envelope,
            ttlSeconds,
        });
    }

    async setError(
        app: string,
        domain: string,
        key: string,
        message: string,
        ttlSeconds: number,
    ): Promise<void> {
        const envelope: ReportResultEnvelope<never> = {
            status: 'error',
            message,
            generatedAt: new Date().toISOString(),
        };
        await this.appCache.set({
            app,
            domain,
            key,
            group: 'result',
            data: envelope,
            ttlSeconds,
        });
    }
}
