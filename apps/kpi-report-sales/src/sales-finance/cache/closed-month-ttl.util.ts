/**
 * TTL ячейки закрытого месяца (`closed:month:{yyyy-MM}`) — чистые функции.
 *
 * Правило heavy-endpoint-queue (ai/rules/heavy-endpoint-queue.md):
 * долгоживуще кэшируются только закрытые прошлые месяцы. Но последние
 * закрытые месяцы ещё «шевелятся»: сделки закрывают задним числом и
 * передают другим ответственным, поэтому они живут сутки, а старше — 30
 * дней. «Сейчас» — локальный календарь процесса, как у
 * splitIntoMonthSegments.
 */
import {
    SALES_FINANCE_PAST_MONTH_TTL_SECONDS,
    SALES_FINANCE_RECENT_CLOSED_MONTHS,
    SALES_FINANCE_RECENT_MONTH_TTL_SECONDS,
} from '../constants/sales-finance.const';

const MONTH_KEY = /^(\d{4})-(\d{2})$/;

/**
 * Месяц `yyyy-MM` входит в `count` последних закрытых относительно now:
 * при now в сентябре — август (1) и июль (2). Текущий, будущий и
 * нераспознанный месяц — не «недавний закрытый».
 */
export function isRecentClosedMonth(
    month: string,
    now: Date,
    count: number = SALES_FINANCE_RECENT_CLOSED_MONTHS,
): boolean {
    const match = MONTH_KEY.exec(month);
    if (!match) return false;
    const [year, monthNumber] = match.slice(1).map(Number);
    const monthsAgo =
        now.getFullYear() * 12 + now.getMonth() - (year * 12 + monthNumber - 1);
    return monthsAgo >= 1 && monthsAgo <= count;
}

/** TTL закрытого месяца: последние закрытые — сутки, старше — 30 дней. */
export function closedMonthTtlSeconds(month: string, now: Date): number {
    return isRecentClosedMonth(month, now)
        ? SALES_FINANCE_RECENT_MONTH_TTL_SECONDS
        : SALES_FINANCE_PAST_MONTH_TTL_SECONDS;
}
