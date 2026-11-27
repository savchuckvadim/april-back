/** Округление денег до копеек; шум плавающей точки (1.005 × 100) отсекаем. */
export const roundToCents = (value: number): number =>
    Math.round(Number((value * 100).toPrecision(15))) / 100;

/**
 * Цена региона с НДС на лету: `tax` равен коэффициенту НДС из настроек
 * вендора, `tax_abs` равен рабсу, умноженному на него. Рабс (`abs`) остаётся
 * как есть, то есть без НДС. Хранимые в базе `tax` / `tax_abs` /
 * `own_tax` / `own_tax_abs` для выдачи не используются: смена коэффициента в
 * админке действует сразу, без пересчёта таблиц.
 *
 * Вызывать после слияния своего рабса портала (`resolvePortalPrice`): рабс
 * берётся уже действующий для портала.
 */
export const withRabsVat = <T extends { abs: number }>(
    price: T,
    coefficient: number,
): T & { tax: number; tax_abs: number } => ({
    ...price,
    tax: coefficient,
    tax_abs: roundToCents(price.abs * coefficient),
});
