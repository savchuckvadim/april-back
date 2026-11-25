/**
 * Ответ контроллера по конверту из кэша (чистая функция).
 *
 * ready — данные + дата расчёта (generatedAt из конверта) + признак
 * закрытого периода (closedPeriod): фронт показывает «Рассчитано …» и
 * кнопку «Пересчитать» (forceRefresh). error — текст ошибки без
 * авто-редиспатча. Промах кэша (null) — ответа нет, контроллер ставит job.
 */
import type { IsoDate } from '../../shared/lib/month-segments.util';
import type { ReportResultEnvelope } from './report-result-cache.service';
import { isClosedReportPeriod } from './report-cache-ttl.util';

export type CachedReportResponse<T> =
    | {
          status: 'ready';
          data: T;
          requestKey: string;
          generatedAt: string;
          closedPeriod: boolean;
      }
    | { status: 'error'; message: string; requestKey: string };

export const toCachedReportResponse = <T>(
    envelope: ReportResultEnvelope<T> | null,
    requestKey: string,
    toIsoInclusive: IsoDate,
    now: Date,
): CachedReportResponse<T> | null => {
    if (envelope?.status === 'ready') {
        return {
            status: 'ready',
            data: envelope.data,
            requestKey,
            generatedAt: envelope.generatedAt,
            closedPeriod: isClosedReportPeriod(toIsoInclusive, now),
        };
    }
    if (envelope?.status === 'error') {
        return { status: 'error', message: envelope.message, requestKey };
    }
    return null;
};
