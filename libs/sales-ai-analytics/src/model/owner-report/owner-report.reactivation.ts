import { shiftDate } from '../workdays.util';

/**
 * Признак «реактивация» для отчёта собственнику (правило по ответам
 * владельца 07.11.2026, постановка ai/tasks/2026-11-06-owner-period-report.md):
 * звонок клиенту, у которого сделка «ОП Основная» закрылась отказом не
 * позднее чем за `minDays` дней до звонка, и после этого отказа успешной
 * сделки не было. Открытая новая сделка признак не снимает — это и есть
 * работа по возврату. Отказ свежее `minDays` — доработка, а не возврат.
 */

/** Порог «отказ давно»: раньше — доработка, позже — возврат. */
export const OWNER_REPORT_REACTIVATION_MIN_DAYS = 30;

/** Закрытая сделка компании: день закрытия (TZ портала) и чем закрылась. */
export interface OwnerReportClosedDeal {
    date: string;
    kind: 'refusal' | 'won';
}

/** Реактивация ли звонок дня `callDate` при такой истории сделок компании. */
export function isReactivationCall(
    callDate: string,
    history: readonly OwnerReportClosedDeal[],
    minDays: number = OWNER_REPORT_REACTIVATION_MIN_DAYS,
): boolean {
    const refusals = history
        .filter(deal => deal.kind === 'refusal' && deal.date <= callDate)
        .map(deal => deal.date)
        .sort();
    const latest = refusals[refusals.length - 1];
    if (latest === undefined) return false;
    // Отказ свежее порога — клиента ещё дорабатывают, это не возврат.
    if (latest > shiftDate(callDate, -minDays)) return false;
    return !history.some(
        deal =>
            deal.kind === 'won' && deal.date > latest && deal.date <= callDate,
    );
}
