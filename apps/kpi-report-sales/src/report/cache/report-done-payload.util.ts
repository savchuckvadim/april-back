/**
 * Полезная нагрузка WS-событий готовности отчёта (чистая функция).
 *
 * Помимо данных несёт дату расчёта (generatedAt) и признак закрытого
 * периода (closedPeriod), чтобы фронт показал «Рассчитано …» рядом с
 * кнопкой «Пересчитать» без дополнительного запроса.
 */
import type { IsoDate } from '../../shared/lib/month-segments.util';
import { isClosedReportPeriod } from './report-cache-ttl.util';

/** Нагрузка событий `kpi-report:done` и `kpi-report:calling-statistic:done`. */
export interface ReportDonePayload<T> {
    /** Эхо ключа запроса — фронт отсеивает устаревшие события. */
    requestKey: string;
    data: T;
    /** Момент окончания расчёта, ISO 8601. */
    generatedAt: string;
    /** Период целиком в прошлых месяцах (результат хранится долго). */
    closedPeriod: boolean;
}

export const buildReportDonePayload = <T>(
    requestKey: string,
    data: T,
    toIsoInclusive: IsoDate,
    now: Date,
): ReportDonePayload<T> => ({
    requestKey,
    data,
    generatedAt: now.toISOString(),
    closedPeriod: isClosedReportPeriod(toIsoInclusive, now),
});
