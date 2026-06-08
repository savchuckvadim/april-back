/**
 * Паттерн: товар «упакован» в 6 / 12 / 24 мес. (коэф.), а календарная длина договора (totalMonths)
 * ровно на 1 месяц длиннее qty×коэф. Тогда «лишний» месяц убирается сдвигом даты «с» на +1 месяц в CRM;
 * при большем расхождении поля «с»/«по» остаются истиной — паттерн не срабатывает.
 */

export const LICENSE_PACK_COEFFICIENTS: ReadonlySet<number> = new Set([
    3, 6, 12, 24,
]);

export function licensedMonthsFromDealRow(
    quantity: number,
    coefficient: number,
): number {
    const q = Math.max(0, Number(quantity) || 0);
    const c = Math.max(1, Number(coefficient) || 1);
    return Math.round(q * c);
}

function parseIsoToDate(iso: string): Date | undefined {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? undefined : d;
}

function addMonths(date: Date, months: number): Date {
    const result = new Date(date.getTime());
    result.setMonth(result.getMonth() + months);
    return result;
}

/** Следующий календарный месяц от даты начала договора (как в buildContractActPeriods). */
export function shiftContractStartOneMonthForward(
    fromIso: string,
): string | undefined {
    const start = parseIsoToDate(fromIso);
    if (!start) {
        return undefined;
    }
    return addMonths(start, 1).toISOString();
}

export interface ILicenseCalendarOneMonthShift {
    licensedMonths: number;
    calendarTotalMonths: number;
    shiftedStartFromIso: string;
}

export function tryBuildLicenseCalendarOneMonthShift(args: {
    calendarTotalMonths: number;
    contractFromIso: string;
    productQuantity: number;
    productCoefficient: number;
}): ILicenseCalendarOneMonthShift | null {
    const coef = Math.max(1, Math.floor(Number(args.productCoefficient) || 1));
    if (!LICENSE_PACK_COEFFICIENTS.has(coef)) {
        return null;
    }
    const licensed = licensedMonthsFromDealRow(args.productQuantity, coef);
    if (licensed <= 0) {
        return null;
    }
    const cal = Math.max(0, Math.floor(Number(args.calendarTotalMonths) || 0));
    if (cal - licensed !== 1) {
        return null;
    }
    const shifted = shiftContractStartOneMonthForward(args.contractFromIso);
    if (shifted == null) {
        return null;
    }
    return {
        licensedMonths: licensed,
        calendarTotalMonths: cal,
        shiftedStartFromIso: shifted,
    };
}
