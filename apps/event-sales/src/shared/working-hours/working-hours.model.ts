import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
    BX_CALENDAR_WEEK_DAY_INDEX,
    BxCalendarWeekDayCode,
} from '@lib/bitrix/domain/calendar/consts/bx-calendar.const';
import { IBXCalendarSettings } from '@lib/bitrix/domain/calendar/interface/bx-calendar.interface';
import { ETimeZone } from '@lib/shared/lib/date';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Производственный календарь портала в пригодном для сравнения виде.
 *
 * `source` важен вызывающему: на `fallback` мы работаем по общему
 * российскому графику, а не по настройкам клиента, и это стоит писать в
 * лог один раз, а не молча считать, что всё в порядке.
 */
export interface PortalWorkingHours {
    /** Час начала рабочего дня в TZ портала (9 или 8.5 → 8.5). */
    startHour: number;
    /** Час окончания рабочего дня в TZ портала. */
    endHour: number;
    /** Выходные дни недели индексами Date#getDay (0 — воскресенье). */
    weekHolidays: number[];
    /** Праздники года ключами «день.месяц» ('1.1', '23.2'). */
    yearHolidays: Set<string>;
    source: 'portal' | 'fallback';
}

/**
 * График по умолчанию — когда портал не отдал настройки (нет scope
 * `calendar`, коробка без модуля, сбой вызова).
 *
 * Пн–Пт 9:00–18:00 и праздники РФ: это осознанно КОНСЕРВАТИВНЫЙ дефолт.
 * Кроны звонят живым людям, и ошибиться лучше в сторону «промолчали», чем
 * поставить клиенту звонок в воскресенье.
 */
export const DEFAULT_WORKING_HOURS: Omit<PortalWorkingHours, 'source'> = {
    startHour: 9,
    endHour: 18,
    weekHolidays: [0, 6],
    yearHolidays: new Set([
        '1.1',
        '2.1',
        '3.1',
        '4.1',
        '5.1',
        '6.1',
        '7.1',
        '8.1',
        '23.2',
        '8.3',
        '1.5',
        '9.5',
        '12.6',
        '4.11',
    ]),
};

/** Часы из настроек портала: документация обещает строку, приходит и число. */
const toHour = (raw: string | number, fallback: number): number => {
    const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
    return Number.isFinite(value) && value >= 0 && value <= 24
        ? value
        : fallback;
};

/**
 * Праздники года: портал отдаёт их одной строкой «1.1,7.1,23.2».
 * Пробелы и пустые куски встречаются — чистим, а не доверяем формату.
 */
const toYearHolidays = (raw: string): Set<string> =>
    new Set(
        String(raw ?? '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean),
    );

/** Настройки календаря портала → сравнимый график. */
export function toPortalWorkingHours(
    settings: IBXCalendarSettings,
): PortalWorkingHours {
    const weekHolidays = (settings.week_holidays ?? [])
        .map(
            code =>
                BX_CALENDAR_WEEK_DAY_INDEX[code as BxCalendarWeekDayCode] as
                    | number
                    | undefined,
        )
        .filter((index): index is number => index !== undefined);

    return {
        startHour: toHour(
            settings.work_time_start,
            DEFAULT_WORKING_HOURS.startHour,
        ),
        endHour: toHour(settings.work_time_end, DEFAULT_WORKING_HOURS.endHour),
        // Пустой массив выходных — законная настройка (портал 7/7), но
        // отличить её от «поле не пришло» нельзя, поэтому пустой список
        // трактуем как настройку: у портала в этом поле всегда что-то есть.
        weekHolidays,
        yearHolidays: toYearHolidays(settings.year_holidays),
        source: 'portal',
    };
}

/** График по умолчанию как значение (Set копируется — он мутабелен). */
export function fallbackWorkingHours(): PortalWorkingHours {
    return {
        ...DEFAULT_WORKING_HOURS,
        yearHolidays: new Set(DEFAULT_WORKING_HOURS.yearHolidays),
        source: 'fallback',
    };
}

/**
 * Рабочее ли сейчас время на портале.
 *
 * Считается В ТАЙМЗОНЕ ПОРТАЛА, а не сервера: бэкенд может стоять в UTC, а
 * клиент — во Владивостоке, и «10 утра» у них разное.
 *
 * Границы: начало включительно, конец исключительно — в 18:00 при
 * `endHour=18` рабочий день уже закончился.
 */
export function isWithinWorkingHours(
    hours: PortalWorkingHours,
    moment: Date,
    timezone: ETimeZone,
): boolean {
    const local = dayjs(moment).tz(timezone);

    if (hours.weekHolidays.includes(local.day())) return false;
    if (hours.yearHolidays.has(`${local.date()}.${local.month() + 1}`)) {
        return false;
    }

    // Дробные часы (8.5 = 8:30) портал отдаёт — сравниваем в часах с долей.
    const hourOfDay = local.hour() + local.minute() / 60;
    return hourOfDay >= hours.startHour && hourOfDay < hours.endHour;
}

/**
 * Момент «столько-то часов назад», где ВЫХОДНЫЕ И ПРАЗДНИКИ НЕ СЧИТАЮТСЯ.
 *
 * Зачем: окно подстраховки, отмеренное календарными часами, не переживает
 * длинные выходные. Звонок назначен в пятницу вечером, хук упал — к утру
 * вторника прошло больше 96 календарных часов, и потерянная работа выпала
 * из окна навсегда, хотя рабочего времени с тех пор прошло всего ничего.
 *
 * Считаем сутками: каждый пройденный назад РАБОЧИЙ день списывает 24 часа
 * из бюджета, выходной — ноль (просто шагаем дальше). Это грубее, чем
 * считать по часам рабочего дня, зато результат предсказуем и объясним:
 * «96 часов» читается как «четыре рабочих дня».
 *
 * Ограничитель в 366 шагов — страховка от бесконечного цикла на портале,
 * где выходными помечены все семь дней недели.
 */
export function workingHoursAgo(
    hours: PortalWorkingHours,
    from: Date,
    lookbackHours: number,
    timezone: ETimeZone,
): Date {
    const isWorkingDay = (moment: dayjs.Dayjs): boolean =>
        !hours.weekHolidays.includes(moment.day()) &&
        !hours.yearHolidays.has(`${moment.date()}.${moment.month() + 1}`);

    let cursor = dayjs(from).tz(timezone);
    let remaining = Math.max(0, lookbackHours);
    let guard = 0;

    while (remaining > 0 && guard < 366) {
        guard += 1;
        const previous = cursor.subtract(1, 'day');
        if (isWorkingDay(previous)) remaining -= 24;
        cursor = previous;
    }
    // Перелёт последнего шага возвращаем: бюджет мог кончиться посреди дня.
    return cursor.add(remaining < 0 ? -remaining : 0, 'hour').toDate();
}

/**
 * Ближайший РАБОЧИЙ момент не раньше заданного.
 *
 * Зачем: сроки задач приходят из роботов Битрикса формулой вида
 * `dateadd(Now, "1d")` — «ровно через сутки». Заявка упала в четыре утра, и
 * задача встала на четыре утра (наблюдалось 17.09.2026). Формула про
 * календарь портала не знает и знать не может, а мы знаем.
 *
 * Правило: момент в рабочем времени остаётся как есть — робот вправе решать.
 * Ночь, выходной или праздник переносятся на НАЧАЛО ближайшего рабочего дня:
 * предсказуемо, объяснимо и никогда не раньше исходного срока.
 *
 * Ограничитель в 366 шагов — страховка от портала, где выходными помечена
 * вся неделя: лучше вернуть исходное, чем зациклиться.
 */
export function nextWorkingMoment(
    hours: PortalWorkingHours,
    moment: Date,
    timezone: ETimeZone,
): Date {
    if (isWithinWorkingHours(hours, moment, timezone)) return moment;

    const isWorkingDay = (day: dayjs.Dayjs): boolean =>
        !hours.weekHolidays.includes(day.day()) &&
        !hours.yearHolidays.has(`${day.date()}.${day.month() + 1}`);

    const startOf = (day: dayjs.Dayjs): dayjs.Dayjs =>
        day
            .startOf('day')
            .add(Math.floor(hours.startHour), 'hour')
            .add(Math.round((hours.startHour % 1) * 60), 'minute');

    let cursor = dayjs(moment).tz(timezone);

    /*
     * Раннее утро рабочего дня — это «сегодня к началу дня», а не «завтра»:
     * заявка в 04:00 понедельника должна попасть на 09:00 понедельника.
     */
    const hourOfDay = cursor.hour() + cursor.minute() / 60;
    if (isWorkingDay(cursor) && hourOfDay < hours.startHour) {
        return startOf(cursor).toDate();
    }

    for (let guard = 0; guard < 366; guard += 1) {
        cursor = cursor.add(1, 'day');
        if (isWorkingDay(cursor)) return startOf(cursor).toDate();
    }
    return moment;
}
