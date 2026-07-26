import { Injectable } from '@nestjs/common';
import { AppCacheService, AppCacheResetResponseDto } from '@lib/app-cache';
import type { IsoMonth } from '../../shared/lib/month-segments.util';
import type { AirtimeMonthCell } from '../types/airtime-statistic.type';
import { buildAirtimeCellKey } from './airtime-cache-key.util';
import {
    AIRTIME_CACHE_APP,
    AIRTIME_CACHE_GROUP_MONTH,
    AIRTIME_MONTH_TTL_SECONDS,
} from '../constants/airtime.const';

/**
 * Кэш месячных ячеек эфирного времени поверх центрального AppCache
 * (Redis + app_cache в MySQL: переживает перезагрузку Redis, виден в
 * инспекции POST /app-cache/list { app: 'airtime' }).
 *
 * Гранулярность — «домен × сотрудник × месяц»: ячейки маленькие (~120 байт,
 * только агрегат), из них собирается любой состав команды и любой диапазон
 * прошлых месяцев. Текущий месяц НЕ кэшируется — всегда живой запрос
 * (см. AirtimeStatisticUseCase).
 *
 * Очистка: TTL AIRTIME_MONTH_TTL_SECONDS (Redis протухает сам, строки БД
 * удаляет почасовой purgeExpired-cron AppCacheService); ручной сброс —
 * POST /app-cache/reset { app: 'airtime', domain }.
 *
 * Инжектится (@Injectable) — bitrix-состояния нет, race condition из
 * CLAUDE.md невозможен. В share-link-снапшоте создаётся вручную
 * `new AirtimeCacheService(appCache)` (прецедент — SalesFinanceCacheService).
 */
@Injectable()
export class AirtimeCacheService {
    constructor(private readonly appCache: AppCacheService) {}

    /**
     * Ячейки месяца по списку сотрудников. Результат — Map по userId;
     * null — промаха (месяц этому сотруднику ещё не считали или ячейка
     * протухла). Один Redis MGET + один findMany на все промахи.
     */
    async getMonthCells(
        domain: string,
        month: IsoMonth,
        userIds: number[],
    ): Promise<Map<number, AirtimeMonthCell | null>> {
        const cells = await this.appCache.getMany<AirtimeMonthCell>(
            userIds.map(userId => ({
                app: AIRTIME_CACHE_APP,
                domain,
                key: buildAirtimeCellKey(userId, month),
            })),
        );
        return new Map(userIds.map((userId, i) => [userId, cells[i]]));
    }

    /**
     * Записывает ячейки месяца (write-through: БД + Redis, одной пачкой).
     * ВАЖНО: нулевые ячейки (сотрудник без звонков) записывать обязательно —
     * иначе «тихие» сотрудники будут вечно промахиваться и заново гонять
     * voximplant-выборку месяца.
     */
    async setMonthCells(
        domain: string,
        month: IsoMonth,
        cells: ReadonlyMap<number, AirtimeMonthCell>,
    ): Promise<void> {
        if (!cells.size) return;
        await this.appCache.setMany(
            [...cells.entries()].map(([userId, cell]) => ({
                app: AIRTIME_CACHE_APP,
                domain,
                key: buildAirtimeCellKey(userId, month),
                group: AIRTIME_CACHE_GROUP_MONTH,
                data: cell,
                ttlSeconds: AIRTIME_MONTH_TTL_SECONDS,
            })),
        );
    }

    /**
     * Точечный сброс ячеек (БД + Redis разом): весь портал / месяц по всем /
     * сотрудники целиком / конкретные ячейки. Следующий запрос за задетые
     * месяцы честно пересчитает их из Bitrix.
     */
    async reset(
        domain: string,
        month?: IsoMonth,
        userIds?: number[],
    ): Promise<AppCacheResetResponseDto> {
        if (userIds?.length) {
            let deletedDb = 0;
            let deletedRedis = 0;
            for (const userId of userIds) {
                const result = await this.appCache.reset({
                    app: AIRTIME_CACHE_APP,
                    domain,
                    // месяц указан — точная ячейка, иначе все месяцы юзера
                    keyPrefix: month
                        ? buildAirtimeCellKey(userId, month)
                        : `u${userId}:`,
                });
                deletedDb += result.deletedDb;
                deletedRedis += result.deletedRedis;
            }
            return { deletedDb, deletedRedis };
        }

        return this.appCache.reset({
            app: AIRTIME_CACHE_APP,
            domain,
            // месяц без юзеров — все ячейки месяца (суффикс ключа ':yyyy-MM')
            ...(month ? { keySuffix: `:${month}` } : {}),
        });
    }
}
