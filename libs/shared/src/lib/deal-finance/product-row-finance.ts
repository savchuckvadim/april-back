/**
 * Финансовая математика по товарным строкам сделки.
 *
 * Все суммы округляются до 2 знаков. discountSum сознательно не вычитается
 * (v1): в текущих порталах скидка уже заложена в price.
 */
import {
    DealFinanceRow,
    effectiveRowMonths,
    measureMonthFactorFromName,
} from './measure-month-factor';

/** Округление денег до 2 знаков. */
export function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Полная сумма строки: цена × количество. */
export function rowTotalAmount(row: DealFinanceRow): number {
    const price = Number(row.price ?? 0);
    const quantity = Number(row.quantity ?? 0);
    return roundMoney(price * quantity);
}

/** Месячная доля строки: полная сумма / эффективные месяцы строки. */
export function rowMonthlyAmount(row: DealFinanceRow): number {
    return roundMoney(rowTotalAmount(row) / effectiveRowMonths(row));
}

/** Σ полных сумм строк («аванс» — деньги, которые уже в сделке). */
export function sumRowsTotal(rows: DealFinanceRow[]): number {
    return roundMoney(rows.reduce((acc, row) => acc + rowTotalAmount(row), 0));
}

/** Σ месячных долей строк (сумма сделки, приведённая к одному месяцу). */
export function sumRowsMonthly(rows: DealFinanceRow[]): number {
    return roundMoney(
        rows.reduce((acc, row) => acc + rowMonthlyAmount(row), 0),
    );
}

/** Σ оплаченных месяцев по строкам: количество × множитель месяцев. */
export function sumRowsMonths(rows: DealFinanceRow[]): number {
    return rows.reduce((acc, row) => {
        const quantity = Math.max(Number(row.quantity ?? 0), 0);
        return acc + quantity * measureMonthFactorFromName(row.measureName);
    }, 0);
}
