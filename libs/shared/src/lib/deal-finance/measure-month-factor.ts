/**
 * Коэффициент месяцев из названия единицы измерения товарной строки.
 *
 * В сделках ОП/сервиса единица измерения кодирует срок лицензии:
 * «лиц.12мес.» → 12, «лиц.6мес.» → 6 и т.д. Количество товара, умноженное
 * на коэффициент, даёт «оплаченные месяцы» (аванс в месяцах).
 *
 * Канонический источник правды для этой математики (ранее логика
 * дублировалась в apps/event-service/src/smart-act).
 */

/** Известные множители месяцев; больший проверяется первым (24 раньше 12). */
export const MEASURE_MONTH_FACTORS = [24, 12, 6, 3] as const;

export type MeasureMonthFactor = (typeof MEASURE_MONTH_FACTORS)[number];

/**
 * Извлекает множитель месяцев из названия единицы измерения.
 * Нет вхождения известного множителя (или имя пустое) → 1.
 */
export function measureMonthFactorFromName(measureName?: string): number {
    if (!measureName) return 1;
    for (const factor of MEASURE_MONTH_FACTORS) {
        if (measureName.includes(String(factor))) {
            return factor;
        }
    }
    return 1;
}

/** Минимальный структурный тип товарной строки для финансовой математики. */
export interface DealFinanceRow {
    price?: number;
    quantity?: number;
    measureName?: string;
}

/**
 * Эффективное число месяцев, которое покрывает товарная строка:
 * количество × множитель из единицы измерения, минимум 1.
 */
export function effectiveRowMonths(row: DealFinanceRow): number {
    const quantity = Math.max(Number(row.quantity ?? 0), 0);
    const factor = measureMonthFactorFromName(row.measureName);
    return Math.max(1, Math.floor(quantity * factor));
}
