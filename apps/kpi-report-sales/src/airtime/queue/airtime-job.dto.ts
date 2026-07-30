import type { IsoDate, IsoMonth } from '../../shared/lib/month-segments.util';

/**
 * Контракты «контроллер → воркер» очереди эфирного времени. Валидаторы не
 * нужны — данные не с фронта (прецедент — sales-finance-job.dto.ts).
 *
 * dateFrom/dateTo — нормализованный период ИСХОДНОГО запроса: воркер после
 * сбора партиции перепроверяет готовность всего периода и шлёт прогресс/done.
 * socketId — WS первого запросившего; второй подписчик с тем же jobId
 * доезжает поллингом (см. AirtimeDispatchService).
 */
interface AirtimeJobBase {
    domain: string;
    requestKey: string;
    socketId?: string;
    dateFrom: IsoDate;
    dateTo: IsoDate;
}

/** Сбор месячной партиции (полный прошедший месяц, портал-wide). */
export interface AirtimeMonthJobData extends AirtimeJobBase {
    month: IsoMonth;
}

/** Сбор дневного диапазона (хвост текущего/краевого месяца, портал-wide). */
export interface AirtimeDaySpanJobData extends AirtimeJobBase {
    month: IsoMonth;
    from: IsoDate;
    to: IsoDate;
    forceRefresh: boolean;
}
