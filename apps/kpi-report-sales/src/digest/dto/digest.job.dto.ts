import { KpiDigestFiltersDto } from './digest-request.dto';

/**
 * Контракт «контроллер → воркер» (валидаторы не нужны — данные не с фронта).
 * resultKey/requestKey посчитаны контроллером — воркер пишет результат или
 * ошибку ровно в тот ключ, который опрашивает поллинг.
 */
export interface KpiDigestJob {
    domain: string;
    filters: KpiDigestFiltersDto;
    socketId?: string;
    requestKey: string;
    resultKey: string;
    forceRefresh?: boolean;
}
