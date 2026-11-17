import { ETimeZone } from '@lib/shared/lib/date';
import {
    isoWeekdayOf,
    lastClosedRopPeriod,
    previousRopPeriod,
    ROP_PERIOD_KIND,
    RopPeriod,
    RopPeriodKind,
    ropPeriodOf,
    ropPortalDay,
    ropPortalHour,
    shiftRopDay,
} from './rop-period';

/**
 * РАСПИСАНИЕ ОТЧЁТОВ РОПу — политики «пора ли выпускать»: какой закрытый
 * период пора отправить в момент `now` по времени портала. Политика
 * отвечает только «пора / не пора и за что»; отправлен ли этот период уже
 * (метка выпуска в Redis) — забота движка.
 *
 * Догон как у отчёта по дублям: не успели в свой день и час (бэк или
 * Битрикс лежали) — отчёт уходит позже в том же периоде, но час
 * проверяется и в дни догона: задача руководителю не прилетит ночью.
 */

/** Рабочий ли день портала ('YYYY-MM-DD'): календарь портала или запасной. */
export interface RopWorkdayCalendar {
    isWorkday(day: string): boolean;
}

/** Момент проверки и всё, что нужно для ответа «пора ли». */
export interface RopDueCheck {
    readonly now: Date;
    readonly timezone: ETimeZone;
    readonly calendar: RopWorkdayCalendar;
}

/** Политика выпуска периода одного вида. */
export interface RopDuePolicy {
    readonly kind: RopPeriodKind;
    /** Закрытый период, который пора отправить; null — ещё не время. */
    due(check: RopDueCheck): RopPeriod | null;
}

/** Еженедельный выпуск: день недели и час по времени портала. */
export interface RopWeeklyDueOptions {
    /** 1 — понедельник … 7 — воскресенье. */
    readonly weekday: number;
    /** Час начала выпуска, 0–23. */
    readonly hour: number;
    /** Только в рабочие дни портала: праздничный понедельник — во вторник. */
    readonly workdaysOnly: boolean;
}

/**
 * Виды с выпуском в первый рабочий день периода. Пока только месяц;
 * квартал, полугодие и год добавятся сюда во второй волне.
 */
export type RopFirstWorkdayKind = typeof ROP_PERIOD_KIND.month;

export interface RopFirstWorkdayDueOptions {
    readonly kind: RopFirstWorkdayKind;
    /** Час начала выпуска, 0–23. */
    readonly hour: number;
}

const assertHour = (hour: number): void => {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        throw new RangeError(
            `Час выпуска должен быть целым 0–23, а не ${hour}`,
        );
    }
};

/**
 * Еженедельно: с дня `weekday` и часа `hour` до конца недели отправляется
 * прошлая календарная неделя. При `workdaysOnly` нерабочие дни пропускаются
 * (неделя, где после дня выпуска рабочих дней нет, не догоняется — следом
 * уйдёт уже следующая).
 */
export function weeklyDue(options: RopWeeklyDueOptions): RopDuePolicy {
    assertHour(options.hour);
    if (
        !Number.isInteger(options.weekday) ||
        options.weekday < 1 ||
        options.weekday > 7
    ) {
        throw new RangeError(
            `День недели выпуска должен быть целым 1–7, а не ${options.weekday}`,
        );
    }
    return {
        kind: ROP_PERIOD_KIND.week,
        due: ({ now, timezone, calendar }) => {
            const today = ropPortalDay(now, timezone);
            if (isoWeekdayOf(today) < options.weekday) return null;
            if (ropPortalHour(now, timezone) < options.hour) return null;
            if (options.workdaysOnly && !calendar.isWorkday(today)) return null;
            return lastClosedRopPeriod(ROP_PERIOD_KIND.week, today);
        },
    };
}

/** Первый рабочий день периода; null — по календарю рабочих дней в нём нет. */
function scanFirstWorkday(
    period: RopPeriod,
    calendar: RopWorkdayCalendar,
): string | null {
    for (let day = period.from; day <= period.to; day = shiftRopDay(day, 1)) {
        if (calendar.isWorkday(day)) return day;
    }
    return null;
}

/**
 * Первый рабочий день периода по календарю портала. Календарь без единого
 * рабочего дня в периоде (сбой настроек) — первый день периода.
 */
export function firstWorkdayOf(
    period: RopPeriod,
    calendar: RopWorkdayCalendar,
): string {
    return scanFirstWorkday(period, calendar) ?? period.from;
}

/**
 * В первый рабочий день периода с часа `hour` отправляется прошлый период
 * (1 декабря — ноябрь); не успели — в следующие рабочие дни того же
 * периода. Сломанный календарь без рабочих дней не останавливает выпуск:
 * тогда годится любой день периода.
 */
export function firstWorkdayDue(
    options: RopFirstWorkdayDueOptions,
): RopDuePolicy {
    assertHour(options.hour);
    return {
        kind: options.kind,
        due: ({ now, timezone, calendar }) => {
            const today = ropPortalDay(now, timezone);
            const current = ropPeriodOf(options.kind, today);
            const first = scanFirstWorkday(current, calendar);
            if (today < (first ?? current.from)) return null;
            if (ropPortalHour(now, timezone) < options.hour) return null;
            if (first !== null && !calendar.isWorkday(today)) return null;
            return previousRopPeriod(current);
        },
    };
}
