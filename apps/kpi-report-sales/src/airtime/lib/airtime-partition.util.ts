/**
 * Разбиение периода отчёта на ПАРТИЦИОННЫЕ ЮНИТЫ очереди — чистая логика
 * без Bitrix/кэша (юнит-тестируется отдельно).
 *
 * Юнит = атомарная единица сбора И готовности:
 *  - 'month' — полный прошедший календарный месяц: собирается портал-wide
 *    одним job'ом, готовность = месячный маркер;
 *  - 'span'  — неполный кусок месяца (краевой сегмент периода или текущий
 *    месяц): готовность = дневные маркеры прошедших дней (+ today-блоб,
 *    если диапазон включает сегодня).
 *
 * Будущие дни в юниты не попадают (звонков ещё нет — достоверный ноль).
 */
import {
    IsoDate,
    IsoMonth,
    monthOf,
    prevDay,
    splitIntoMonthSegments,
    toIsoDateOf,
} from '../../shared/lib/month-segments.util';

export interface AirtimeMonthUnit {
    kind: 'month';
    month: IsoMonth;
}

export interface AirtimeSpanUnit {
    kind: 'span';
    month: IsoMonth;
    /** Начало диапазона (включительно), yyyy-MM-dd. */
    from: IsoDate;
    /** Конец диапазона (включительно), не позже сегодняшнего дня. */
    to: IsoDate;
    /** Диапазон включает сегодня — нужен живой today-блоб. */
    includesToday: boolean;
}

export type AirtimePartitionUnit = AirtimeMonthUnit | AirtimeSpanUnit;

/**
 * Период [fromIso..toIso] (включительно, целые дни) → список юнитов.
 * from > to или период целиком в будущем → пустой список (отчёт из нулей).
 */
export function buildPartitionUnits(
    fromIso: IsoDate,
    toIso: IsoDate,
    now: Date,
): AirtimePartitionUnit[] {
    const today = toIsoDateOf(now);
    const segments = splitIntoMonthSegments(fromIso, toIso, now);
    const units: AirtimePartitionUnit[] = [];

    for (const segment of segments) {
        if (segment.cacheable) {
            units.push({ kind: 'month', month: segment.month });
            continue;
        }
        // Сегмент целиком в будущем — собирать нечего.
        if (segment.from > today) continue;

        const to = segment.to < today ? segment.to : today;
        units.push({
            kind: 'span',
            month: segment.month,
            from: segment.from,
            to,
            includesToday: segment.to >= today,
        });
    }

    return units;
}

/** Прошедшие (завершённые) дни span-юнита: [from .. min(to, вчера)]. */
export function spanCompletedRange(
    unit: AirtimeSpanUnit,
    today: IsoDate,
): { from: IsoDate; to: IsoDate } | null {
    const yesterday = prevDay(today);
    const to = unit.to < yesterday ? unit.to : yesterday;
    return unit.from <= to ? { from: unit.from, to } : null;
}

/** Месяц, которому принадлежит дата (yyyy-MM-dd → yyyy-MM). */
export function monthOfDate(date: IsoDate): IsoMonth {
    return date.slice(0, 7) as IsoMonth;
}

/** Сегодня по серверному времени (yyyy-MM-dd). */
export function todayIso(now: Date = new Date()): IsoDate {
    return toIsoDateOf(now);
}

/** Текущий месяц по серверному времени (yyyy-MM). */
export function currentMonthIso(now: Date = new Date()): IsoMonth {
    return monthOf(now);
}
