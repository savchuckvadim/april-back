/**
 * Произвольное число ОД (X-ОД): фронт конструктора шлёт синтетический код
 * `x_<type>_<n>` (apps/konstructor …/catalog/lib/custom-od.util.ts).
 * Справочной строки у такой поставки нет — тексты берутся из шаблона
 * ближайшей справочной поставки того же типа.
 */

export type SupplyKind = 'internet' | 'proxima';

export interface CustomSupplyCode {
    type: SupplyKind;
    usersQuantity: number;
}

const CUSTOM_CODE_RE = /^x_(internet|proxima)_(\d+)$/;

export const parseCustomSupplyCode = (code: string): CustomSupplyCode | null => {
    const match = CUSTOM_CODE_RE.exec(code);
    if (!match) return null;
    const usersQuantity = Number(match[2]);
    if (!Number.isFinite(usersQuantity) || usersQuantity <= 0) return null;
    return { type: match[1] as SupplyKind, usersQuantity };
};

/** Справочные поставки с числом ОД в коде (`internet_5`), без особых (std/local/flash). */
export const isNumberedSupplyCode = (code: string, type: SupplyKind): boolean =>
    new RegExp(`^${type}_\\d+$`).test(code);
