import type { SupportDialogHistoryRow } from './support-dialog-history';
import { supportDialogUrl } from './support-signal.formatter';

/** Обращение в сводке портала. */
export interface SupportDialogHistoryItem {
    sessionId: number;
    chatId: number;
    lineDomain: string;
    clientName: string | null;
    operatorName: string | null;
    firstSeenAt: Date | null;
    closedAt: Date | null;
    /** Сколько дольше всего клиент ждал ответа, минут. */
    maxWaitedMinutes: number;
    /** Сотрудник ответил хотя бы раз. */
    answered: boolean;
    /** Открыть диалог в чате линии. */
    url: string;
}

/** Статистика обращений портала-клиента за период. */
export interface SupportDialogStats {
    total: number;
    /** Ещё открыты. */
    open: number;
    /** Закрыты без единого ответа сотрудника (как видел монитор). */
    closedUnanswered: number;
    /** Среднее из «дольше всего ждал» по обращениям, где клиент ждал; null — не ждали. */
    avgWaitMinutes: number | null;
    /** Самое долгое ожидание за период, минут. */
    longestWaitMinutes: number;
    /** Когда пришло последнее обращение. */
    lastAt: Date | null;
    /** Последние обращения, новые первыми. */
    recent: SupportDialogHistoryItem[];
}

const toItem = (row: SupportDialogHistoryRow): SupportDialogHistoryItem => ({
    sessionId: row.sessionId,
    chatId: row.chatId,
    lineDomain: row.lineDomain,
    clientName: row.clientName,
    operatorName: row.operatorName,
    firstSeenAt: row.firstSeenAt,
    closedAt: row.closedAt,
    maxWaitedMinutes: row.maxWaitedMinutes,
    answered: row.answeredAt !== null,
    url: supportDialogUrl(row.lineDomain, row.chatId),
});

const timeOf = (date: Date | null): number => date?.getTime() ?? 0;

/** Сводка по строкам истории (порядок строк не важен). */
export function summarizeDialogHistory(
    rows: readonly SupportDialogHistoryRow[],
    recentLimit: number,
): SupportDialogStats {
    const sorted = [...rows].sort(
        (a, b) => timeOf(b.firstSeenAt) - timeOf(a.firstSeenAt),
    );
    const waits = rows
        .map(row => row.maxWaitedMinutes)
        .filter(minutes => minutes > 0);
    return {
        total: rows.length,
        open: rows.filter(row => row.closedAt === null).length,
        closedUnanswered: rows.filter(
            row => row.closedAt !== null && row.answeredAt === null,
        ).length,
        avgWaitMinutes: waits.length
            ? Math.round(waits.reduce((sum, m) => sum + m, 0) / waits.length)
            : null,
        longestWaitMinutes: waits.length ? Math.max(...waits) : 0,
        lastAt: sorted[0]?.firstSeenAt ?? null,
        recent: sorted.slice(0, recentLimit).map(toItem),
    };
}
