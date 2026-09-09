/**
 * Безопасное приведение значения Битрикса к строке для сравнения.
 *
 * ЗАЧЕМ. Поля приходят как `unknown`: строка, число, массив, иногда объект.
 * Прямой `String(value)` на объекте даёт «[object Object]» — сравнение
 * начинает считать разные объекты одинаковыми, а линтер справедливо
 * запрещает такую подстановку. Здесь объект честно превращается в пустую
 * строку: «значения нет» лучше, чем ложное совпадение.
 */
export function scalarText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (typeof value === 'bigint') return value.toString();
    return '';
}
