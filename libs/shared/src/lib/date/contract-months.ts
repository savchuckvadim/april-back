/**
 * Точный расчёт длительности договора в календарных месяцах.
 *
 * Канонический источник правды для «сколько месяцев длится договор».
 * Раньше формула дублировалась: грубое «дни / 30» в отчёте ОРК
 * (OrkDealsReportService) и точный расчёт в smart-act (DealPerodDataService).
 * Теперь оба места используют этот util.
 *
 * Правило: считаем полные календарные месяцы от даты начала, остаток
 * округляем «по половине месяца» — остаток ≥ 15 дней даёт +1 месяц.
 * Примеры:
 *   01.01.2026–31.12.2026 → 12 месяцев
 *   01.01.2026–15.01.2026 → 1 месяц (15 дней ≥ 15)
 *   01.01.2026–14.01.2026 → 0 месяцев (14 дней < 15)
 */

function addMonths(date: Date, months: number): Date {
    const result = new Date(date.getTime());
    result.setMonth(result.getMonth() + months);
    return result;
}

/** Количество календарных дней между from и to включительно (from <= to). */
function daysDiffInclusive(from: Date, to: Date): number {
    const msInDay = 1000 * 60 * 60 * 24;
    const fromUtc = Date.UTC(
        from.getFullYear(),
        from.getMonth(),
        from.getDate(),
    );
    const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.floor((toUtc - fromUtc) / msInDay) + 1;
}

/** Парсит ISO-строку / число / Date в валидный Date или undefined. */
export function parseContractDate(value: unknown): Date | undefined {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? undefined : value;
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
        return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Количество полных календарных месяцев между from и to (from <= to). */
export function countFullContractMonths(from: Date, to: Date): number {
    let months = 0;
    while (addMonths(from, months + 1) <= to) {
        months += 1;
    }
    return months;
}

/**
 * Длительность договора в месяцах с округлением остатка по половине месяца
 * (остаток ≥ 15 дней → +1 месяц).
 * Возвращает 0, если даты некорректны или from > to.
 */
export function countContractMonths(from: Date, to: Date): number {
    if (
        Number.isNaN(from.getTime()) ||
        Number.isNaN(to.getTime()) ||
        from > to
    ) {
        return 0;
    }
    const fullMonths = countFullContractMonths(from, to);
    const cursor = addMonths(from, fullMonths);
    const restDays = daysDiffInclusive(cursor, to);
    return fullMonths + (restDays >= 15 ? 1 : 0);
}
