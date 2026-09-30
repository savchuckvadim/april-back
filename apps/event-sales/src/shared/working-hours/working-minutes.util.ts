import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { ETimeZone } from '@lib/shared/lib/date';
import {
    isWithinWorkingHours,
    nextWorkingMoment,
    PortalWorkingHours,
} from './working-hours.model';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * РАБОЧИЕ МИНУТЫ — отсчёт времени только внутри рабочего графика портала.
 *
 * Зачем (решение владельца 30.09.2026): заявка, распределённая по кругу,
 * получает на принятие час РАБОЧЕГО времени, и SLA забирает её ровно
 * тогда, когда этот час истёк. Заявка в 17:30 при конце дня в 18:00 —
 * срок 9:30 следующего рабочего дня; заявка ночью — час с начала дня.
 * Календарные минуты давали обратное: ночную заявку SLA забирал в 9:00,
 * не дав менеджеру ни минуты.
 *
 * Ограничитель в 366 дней — страховка от портала, где выходными помечена
 * вся неделя: тогда считаем календарными минутами, а не зацикливаемся.
 */

const GUARD_DAYS = 366;

const isWorkingDay = (hours: PortalWorkingHours, day: dayjs.Dayjs): boolean =>
    !hours.weekHolidays.includes(day.day()) &&
    !hours.yearHolidays.has(`${day.date()}.${day.month() + 1}`);

/** Момент дня по часу графика (8.5 → 8:30), как в nextWorkingMoment. */
const atHour = (day: dayjs.Dayjs, hour: number): dayjs.Dayjs =>
    day
        .startOf('day')
        .add(Math.floor(hour), 'hour')
        .add(Math.round((hour % 1) * 60), 'minute');

/** Конец ближайшего рабочего дня СТРОГО раньше дня `day`; null — не нашёлся. */
const endOfPreviousWorkingDay = (
    hours: PortalWorkingHours,
    day: dayjs.Dayjs,
): dayjs.Dayjs | null => {
    let cursor = day;
    for (let guard = 0; guard < GUARD_DAYS; guard += 1) {
        cursor = cursor.subtract(1, 'day');
        if (isWorkingDay(hours, cursor)) return atHour(cursor, hours.endHour);
    }
    return null;
};

/**
 * Момент через `minutes` рабочих минут после `from` — срок задачи.
 * Нерабочее `from` сначала сдвигается к началу ближайшего рабочего дня.
 */
export function addWorkingMinutes(
    hours: PortalWorkingHours,
    from: Date,
    minutes: number,
    timezone: ETimeZone,
): Date {
    let remaining = Math.max(0, minutes);
    let cursor = dayjs(nextWorkingMoment(hours, from, timezone)).tz(timezone);

    for (let guard = 0; guard < GUARD_DAYS; guard += 1) {
        const dayEnd = atHour(cursor, hours.endHour);
        const available = Math.max(0, dayEnd.diff(cursor, 'minute', true));
        if (remaining <= available) {
            return cursor.add(remaining, 'minute').toDate();
        }
        remaining -= available;
        cursor = dayjs(nextWorkingMoment(hours, dayEnd.toDate(), timezone)).tz(
            timezone,
        );
    }
    return new Date(from.getTime() + minutes * 60_000);
}

/**
 * Момент за `minutes` рабочих минут до `now` — граница просрочки SLA:
 * назначенное раньше него ждёт уже не меньше `minutes` рабочих минут.
 */
export function workingMinutesBefore(
    hours: PortalWorkingHours,
    now: Date,
    minutes: number,
    timezone: ETimeZone,
): Date {
    const calendar = new Date(now.getTime() - minutes * 60_000);
    let remaining = Math.max(0, minutes);

    const local = dayjs(now).tz(timezone);
    const hourOfDay = local.hour() + local.minute() / 60;
    let cursor: dayjs.Dayjs | null = isWithinWorkingHours(hours, now, timezone)
        ? local
        : isWorkingDay(hours, local) && hourOfDay >= hours.endHour
          ? atHour(local, hours.endHour)
          : endOfPreviousWorkingDay(hours, local);

    for (let guard = 0; cursor && guard < GUARD_DAYS; guard += 1) {
        const dayStart = atHour(cursor, hours.startHour);
        const available = Math.max(0, cursor.diff(dayStart, 'minute', true));
        if (remaining <= available) {
            return cursor.subtract(remaining, 'minute').toDate();
        }
        remaining -= available;
        cursor = endOfPreviousWorkingDay(hours, cursor);
    }
    return calendar;
}
