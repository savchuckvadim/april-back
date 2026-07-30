import { ReportGetFiltersDto } from './kpi-report-request.dto';
import { GetCallingStatisticFiltersDto } from './calling-statistic.dto';

/**
 * Контракты «контроллер → воркер» (валидаторы не нужны — данные не с фронта).
 *
 * filters кладутся УЖЕ НОРМАЛИЗОВАННЫМИ (даты YYYY-MM-DD включительно):
 * воркер детерминирован между ретраями и не зависит от формата исходного
 * запроса. resultKey/requestKey посчитаны контроллером — воркер пишет
 * результат/ошибку ровно в тот ключ, который опрашивает поллинг.
 */
export interface ReportKpiJob {
    domain: string;
    filters: ReportGetFiltersDto;
    socketId?: string;
    requestKey: string;
    resultKey: string;
}

export interface CallingStatisticJob {
    domain: string;
    filters: GetCallingStatisticFiltersDto;
    socketId?: string;
    requestKey: string;
    resultKey: string;
}
