import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { ETimeZone } from '@lib/shared/lib/date';
import {
    nextWorkingMoment,
    PortalWorkingHours,
} from '../../shared/working-hours/working-hours.model';
import { addWorkingMinutes } from '../../shared/working-hours/working-minutes.util';
import {
    DuplicateReportPeriod,
    DuplicateReportSchedule,
} from '../types/duplicate-report.types';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * КАЛЕНДАРЬ ОТЧЁТА — чистые функции: когда слать, за какой период и какой
 * срок у задачи. Всё считается В ТАЙМЗОНЕ ПОРТАЛА: бэк может жить в UTC,
 * а «понедельник 9:00» у клиента свой.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (value: number): string => String(value).padStart(2, '0');

/** Календарный день портала как полночь UTC — арифметика дат без сдвигов TZ. */
const localDayUtc = (now: Date, tz: ETimeZone): number => {
    const local = dayjs(now).tz(tz);
    return Date.UTC(local.year(), local.month(), local.date());
};

/** ISO-день недели дня `dayUtc`: 1 — понедельник … 7 — воскресенье. */
const isoWeekdayOf = (dayUtc: number): number =>
    ((new Date(dayUtc).getUTCDay() + 6) % 7) + 1;

const ddmm = (dayUtc: number): string => {
    const date = new Date(dayUtc);
    return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}`;
};

/**
 * Ключ недели — понедельник этой недели по TZ портала («2026-09-28»).
 * По нему крон помнит, что отчёт недели уже ушёл.
 */
export const reportWeekKey = (now: Date, tz: ETimeZone): string => {
    const day = localDayUtc(now, tz);
    return new Date(day - (isoWeekdayOf(day) - 1) * DAY_MS)
        .toISOString()
        .slice(0, 10);
};

/**
 * Наступило ли на этой неделе время отчёта: нужный день и час — или
 * позже в эту неделю. «Позже» важно: бэк лежал в понедельник утром —
 * отчёт уйдёт во вторник, а не через неделю. Час проверяется и в дни
 * догона: задача руководителю не прилетит в три часа ночи.
 */
export const isReportTimeReached = (
    now: Date,
    tz: ETimeZone,
    schedule: DuplicateReportSchedule,
): boolean => {
    const weekday = isoWeekdayOf(localDayUtc(now, tz));
    if (weekday < schedule.weekday) return false;
    return dayjs(now).tz(tz).hour() >= schedule.hour;
};

/** Период отчёта: семь полных дней до дня прогона («22.09–28.09» для 29.09). */
export const reportPeriod = (
    now: Date,
    tz: ETimeZone,
): DuplicateReportPeriod => {
    const today = localDayUtc(now, tz);
    const fromDay = today - 7 * DAY_MS;
    const midnight = (dayUtc: number): Date =>
        dayjs
            .tz(`${new Date(dayUtc).toISOString().slice(0, 10)}T00:00:00`, tz)
            .toDate();
    return {
        from: midnight(fromDay),
        to: midnight(today),
        label: `${ddmm(fromDay)}–${ddmm(today - DAY_MS)}`,
    };
};

/**
 * Срок задачи: конец N-го рабочего дня по календарю портала, считая день
 * отчёта, если рабочее время в нём ещё не кончилось. Понедельник 9:00 и
 * три дня — среда 18:00; вечер пятницы — среда следующей недели.
 */
export function reportTaskDeadline(
    hours: PortalWorkingHours,
    now: Date,
    workingDays: number,
    tz: ETimeZone,
): Date {
    const days = Math.max(1, Math.floor(workingDays));
    const dayMinutes = (hours.endHour - hours.startHour) * 60;
    // График без рабочего времени (сбой настроек) — просто N суток.
    if (dayMinutes <= 0) return new Date(now.getTime() + days * DAY_MS);

    const firstDay = dayjs(nextWorkingMoment(hours, now, tz)).tz(tz);
    const dayStart = dayjs
        .tz(`${firstDay.format('YYYY-MM-DD')}T00:00:00`, tz)
        .add(Math.round(hours.startHour * 60), 'minute');
    return addWorkingMinutes(hours, dayStart.toDate(), days * dayMinutes, tz);
}
