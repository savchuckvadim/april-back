/**
 * Кнопка «Сбросить кэш витрины AI»: та же очистка, что у ручки
 * `POST ai-analytics/cache/reset` приложения kpi-report-sales, но без
 * requesterUserId — из админки под SUPER_USER. Адрес кэша (префикс и
 * области) — общий контракт библиотеки (`contracts/cache.const.ts`), сброс
 * — центральный AppCache (строки app_cache в БД + ключи Redis).
 */
import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import {
    aiAnalyticsCacheResetFilter,
    type AiAnalyticsCacheScope,
} from '../../../contracts/cache.const';

/** Ответ `POST admin/ai-analytics/cache/reset`. */
export interface LaunchCacheResetResult {
    domain: string;
    scope: AiAnalyticsCacheScope;
    /** Удалено строк app_cache в БД. */
    deletedDb: number;
    /** Удалено ключей Redis. */
    deletedRedis: number;
    /** Что произошло — словами. */
    message: string;
}

@Injectable()
export class AiAnalyticsLaunchCacheService {
    private readonly logger = new Logger(AiAnalyticsLaunchCacheService.name);

    constructor(private readonly appCache: AppCacheService) {}

    async reset(
        domain: string,
        scope: AiAnalyticsCacheScope = 'all',
    ): Promise<LaunchCacheResetResult> {
        const { deletedDb, deletedRedis } = await this.appCache.reset(
            aiAnalyticsCacheResetFilter(domain, scope),
        );
        this.logger.log(
            `Кэш витрины AI ${domain} (${scope}) сброшен из админки: БД ${deletedDb}, Redis ${deletedRedis}`,
        );
        return {
            domain,
            scope,
            deletedDb,
            deletedRedis,
            message:
                deletedDb + deletedRedis > 0
                    ? `Кэш витрины сброшен: удалено записей ${deletedDb}, ключей ${deletedRedis}. Пульс, повестка и обзор пересчитаются при следующем открытии вкладки AI.`
                    : 'Кэш витрины уже был пуст — пересчитывать нечего.',
        };
    }
}
