import {
    SUPPLY_CODE_FLASH,
    SUPPLY_CODE_LOCAL,
    SUPPLY_CODE_STD,
} from '../../catalog-install/lib/catalog-codes';

/**
 * Прайс поставщика даёт цену PROF-комплекта по ЧИСЛУ ОД, а каталог
 * хранит её по коду вида поставки (их больше: интернет и проксима —
 * разные способы доставки того же числа ОД, цена у них одна).
 *
 * Поэтому одна ячейка «10 ОД» разворачивается во все виды поставок с
 * тем же числом ОД: internet_10 и proxima_10.
 *
 * Особые поставки (Стандартная, Локальная, Флэш) считаются как 1 ОД —
 * своей колонки в прайсе у них нет (решение владельца 27.10.2026).
 */

/** Вид поставки, в который разворачивается цена */
export interface SupplyTarget {
    code: string;
    type: string;
    usersQuantity: number;
}

/** Особые поставки берут цену колонки «1 ОД» */
const SPECIAL_SUPPLY_CODES: readonly string[] = [
    SUPPLY_CODE_STD,
    SUPPLY_CODE_LOCAL,
    SUPPLY_CODE_FLASH,
];

export const isSpecialSupplyCode = (code: string): boolean =>
    SPECIAL_SUPPLY_CODES.includes(code);

/**
 * Виды поставок, которым достаётся цена колонки с данным числом ОД.
 * Для 1 ОД это ещё и особые поставки.
 */
export const suppliesForOd = (
    supplies: readonly SupplyTarget[],
    usersQuantity: number,
): SupplyTarget[] =>
    supplies.filter(supply => {
        if (isSpecialSupplyCode(supply.code)) return usersQuantity === 1;
        return supply.usersQuantity === usersQuantity;
    });

/**
 * Число ОД, по которому берётся цена для вида поставки (обратное
 * преобразование — нужно при выгрузке текущих цен в прайс).
 */
export const odForSupply = (supply: SupplyTarget): number =>
    isSpecialSupplyCode(supply.code) ? 1 : supply.usersQuantity;

/**
 * Числа ОД, которые реально есть в справочнике поставок — колонки
 * прайса строятся по ним (эталонная сетка 1, 2, 3, 5, 10, 20, 30, 50).
 */
export const odColumnsFromSupplies = (
    supplies: readonly SupplyTarget[],
): number[] =>
    [
        ...new Set(
            supplies
                .map(odForSupply)
                .filter(quantity => Number.isFinite(quantity) && quantity > 0),
        ),
    ].sort((a, b) => a - b);
