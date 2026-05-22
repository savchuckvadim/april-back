/**
 * Разбивает период договора [from, to] на segmentCount последовательных слотов.
 * Первый слот начинается с даты начала договора, последний заканчивается точно на дате окончания договора.
 * Промежуточные границы — через календарные месяцы от начала договора (как addMonths к from).
 */
export interface IContractActPeriodSlot {
    /** Порядковый номер месяца по договору, с 1 */
    monthIndex: number;
    from: string;
    to: string;
}

function parseDate(value: string): Date | undefined {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
}

function addMonths(date: Date, months: number): Date {
    const result = new Date(date.getTime());
    result.setMonth(result.getMonth() + months);
    return result;
}

function dayBefore(date: Date): Date {
    const result = new Date(date.getTime());
    result.setDate(result.getDate() - 1);
    return result;
}

function minDate(a: Date, b: Date): Date {
    return a <= b ? a : b;
}

function toIsoPreserve(value: Date): string {
    return value.toISOString();
}

/**
 * @param fromIso — начало договора (как в periodData.from)
 * @param toIso — конец договора (как в periodData.to)
 * @param segmentCount — обычно periodData.totalMonths
 */
export function buildContractActPeriods(
    fromIso: string,
    toIso: string,
    segmentCount: number,
): IContractActPeriodSlot[] {
    if (segmentCount <= 0) {
        return [];
    }
    const start = parseDate(fromIso);
    const end = parseDate(toIso);
    if (!start || !end || start > end) {
        return [];
    }

    const slots: IContractActPeriodSlot[] = [];

    for (let i = 0; i < segmentCount; i++) {
        const fromDate = i === 0 ? start : addMonths(start, i);
        if (fromDate > end) {
            break;
        }

        let toDate: Date;
        if (i === segmentCount - 1) {
            toDate = end;
        } else {
            const nextBoundary = addMonths(start, i + 1);
            const candidate = dayBefore(nextBoundary);
            toDate = minDate(end, candidate);
        }

        if (fromDate > toDate) {
            break;
        }

        slots.push({
            monthIndex: slots.length + 1,
            from: toIsoPreserve(fromDate),
            to: toIsoPreserve(toDate),
        });
    }

    return slots;
}
