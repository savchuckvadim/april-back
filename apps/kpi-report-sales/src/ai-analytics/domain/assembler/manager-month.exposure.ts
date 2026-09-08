/**
 * Экспозиция менеджер-месяца для месячного снапшота (план §4.2, поток
 * 14b): знаменатель, на который делятся темпы активности.
 *
 * Считает библиотека (`computeExposure`) — здесь только перевод фактов
 * портала в её вход: рабочий календарь, дни с телефонной активностью,
 * заявленные РОПом отсутствия (ключ `ai_analytics_absences` плюс слой
 * менеджера) и доля ставки. Прокси-отсутствия (серии нулевых дней)
 * библиотека находит сама и помечает месяц исключённым из норм —
 * лучше не считать норму, чем считать её по «мёртвым» дням.
 *
 * Чистые функции: без DI и без `new Date()`.
 */
import {
    computeExposure,
    toPortalDate,
    type AiAbsence,
    type ExposureActivityDay,
    type WorkCalendar,
} from '@lib/sales-ai-analytics';
import { monthBounds } from '../../constants/ai-manager-snapshot.const';
import {
    enumerateDates,
    type IsoDate,
} from '../../../shared/lib/month-segments.util';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import type { ManagerExposureFacts } from './manager-snapshot.types';

export interface ManagerExposureInput {
    /** Месяц снапшота 'YYYY-MM'. */
    monthKey: string;
    managerId: string;
    calendar: WorkCalendar;
    /** TZ портала: по ней день звонка относится к дате календаря. */
    timeZone: string;
    /** Звонки месяца (всех менеджеров — фильтрация внутри). */
    rows: readonly DatedLiteRow[];
    /** Отсутствия менеджера: настройки портала + слой менеджера. */
    absences: readonly AiAbsence[];
    /** Доля ставки (0.25…1); нет — полная. */
    fte?: number;
    /** `absence_proxy_min_run` реестра. */
    absenceProxyMinRun?: number;
    /** `min_workdays_month` реестра. */
    minWorkdaysMonth?: number;
}

/** Дни месяца с телефонной активностью менеджера и их объём. */
export function activityDaysOf(
    rows: readonly DatedLiteRow[],
    managerId: string,
    timeZone: string,
): ExposureActivityDay[] {
    const byDay = new Map<string, number>();
    for (const row of rows) {
        if (row.managerId !== managerId) continue;
        const date = toPortalDate(row.callStartedAt, timeZone);
        byDay.set(date, (byDay.get(date) ?? 0) + 1);
    }
    return [...byDay.entries()]
        .map(([date, events]) => ({ date, events }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

/** Дни отсутствий внутри месяца (границы включительно, без повторов). */
export function absenceDaysOf(
    absences: readonly AiAbsence[],
    monthKey: string,
): string[] {
    const { from, to } = monthBounds(monthKey);
    const days = new Set<string>();
    for (const absence of absences) {
        const start = (absence.from > from ? absence.from : from) as IsoDate;
        const end = (absence.to < to ? absence.to : to) as IsoDate;
        for (const day of enumerateDates(start, end)) days.add(day);
    }
    return [...days].sort();
}

/** Экспозиция менеджера за месяц в форме нагрузки снапшота. */
export function buildManagerExposure(
    input: ManagerExposureInput,
): ManagerExposureFacts {
    const { from, to } = monthBounds(input.monthKey);
    const result = computeExposure({
        monthStart: from,
        monthEnd: to,
        calendar: input.calendar,
        activity: activityDaysOf(input.rows, input.managerId, input.timeZone),
        absences: absenceDaysOf(input.absences, input.monthKey),
        ...(input.fte === undefined ? {} : { fte: input.fte }),
        ...(input.absenceProxyMinRun === undefined
            ? {}
            : { absenceProxyMinRun: input.absenceProxyMinRun }),
        ...(input.minWorkdaysMonth === undefined
            ? {}
            : { minWorkdaysMonth: input.minWorkdaysMonth }),
    });
    return {
        dCalendar: result.dCalendar,
        dMt: result.dMt,
        dActive: result.dActive,
        idleDays: result.idleDays,
        daysSource: result.daysSource,
        excludedFromNorms: result.excludeFromNorms,
        excludeReason: result.excludeReason,
        fte: result.fte,
    };
}
