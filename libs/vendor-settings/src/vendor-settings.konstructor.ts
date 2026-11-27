import type { VendorSettingDefinition } from './vendor-settings.registry';

/**
 * Цены конструктора КП. Универсал и консалтинг считаются от рабса региона:
 * цена = рабс × коэффициент НДС × остальные коэффициенты комплекта. Легаси
 * брал рабс с НДС (× 1.2), новый конструктор брал рабс без НДС и выдавал цены
 * ниже. Решение владельца: коэффициент НДС один на всю систему, живёт в
 * настройках вендора и правится в админке, без пересчёта каталога.
 */

/** Ключ настройки: множитель НДС, на который умножается рабс региона. */
export const RABS_VAT_COEFFICIENT_KEY = 'KONSTRUKTOR_RABS_VAT_COEFFICIENT';

/** Значение, когда настройка не задана или задана неверно: НДС 22%. */
export const RABS_VAT_COEFFICIENT_DEFAULT = 1.22;

/**
 * Верхняя граница отсекает проценты вроде 22 (цены выросли бы в 22 раза) на
 * сохранении и при чтении; множитель вроде 1.22 проходит.
 */
export const RABS_VAT_COEFFICIENT_MAX = 2;

export const KONSTRUKTOR_SETTING_KEYS = [RABS_VAT_COEFFICIENT_KEY] as const;

/**
 * Разбор значения настройки: число строго больше 1 и не больше
 * RABS_VAT_COEFFICIENT_MAX; десятичный разделитель — точка или запятая.
 * Всё остальное (текст, 1, 0.8, 22) — null.
 */
export function parseRabsVatCoefficient(
    raw: string | null | undefined,
): number | null {
    const text = (raw ?? '').trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(text)) return null;
    const value = Number(text);
    return Number.isFinite(value) &&
        value > 1 &&
        value <= RABS_VAT_COEFFICIENT_MAX
        ? value
        : null;
}

/** Результат чтения коэффициента: само число и признак «значение задано, но неверно». */
export interface RabsVatCoefficientValue {
    value: number;
    /** Значение задано, но не прошло проверку: действует умолчание, об этом пишем в лог. */
    invalid: boolean;
}

/**
 * Значение коэффициента по сырой настройке. Пусто — умолчание без жалоб;
 * неверное — умолчание и invalid: true, чтобы вызывающий записал предупреждение.
 */
export function resolveRabsVatCoefficient(
    raw: string | null | undefined,
): RabsVatCoefficientValue {
    if ((raw ?? '').trim() === '') {
        return { value: RABS_VAT_COEFFICIENT_DEFAULT, invalid: false };
    }
    const parsed = parseRabsVatCoefficient(raw);
    return parsed === null
        ? { value: RABS_VAT_COEFFICIENT_DEFAULT, invalid: true }
        : { value: parsed, invalid: false };
}

/** Проверка для админки: текст ошибки по-русски или null. */
export const validateRabsVatCoefficient = (value: string): string | null =>
    parseRabsVatCoefficient(value) === null
        ? `Нужно число больше 1 и не больше ${RABS_VAT_COEFFICIENT_MAX}, например ${RABS_VAT_COEFFICIENT_DEFAULT}`
        : null;

export const KONSTRUKTOR_SETTINGS: readonly VendorSettingDefinition[] = [
    {
        key: RABS_VAT_COEFFICIENT_KEY,
        group: 'konstructor',
        label: 'Конструктор КП: коэффициент НДС рабса',
        description: `Во сколько раз цена комплектов универсальной линейки и консалтинга выше рабса региона из-за НДС. Цена = рабс региона × этот коэффициент × остальные коэффициенты комплекта. Число одно на все порталы и регионы, пересчитывать каталог после смены не нужно. Пусто — ${RABS_VAT_COEFFICIENT_DEFAULT} (НДС 22%). Действует в течение минуты.`,
        howTo: 'Вводится множитель: для НДС 22% это 1.22, для НДС 20% это 1.20. Допустимы числа больше 1 и не больше 2, запятая тоже подходит. После смены откройте конструктор и сверьте цену любого комплекта универсальной линейки с формулой: рабс региона × коэффициент × коэффициенты комплекта.',
        secret: false,
        example: String(RABS_VAT_COEFFICIENT_DEFAULT),
        defaultValue: String(RABS_VAT_COEFFICIENT_DEFAULT),
        validate: validateRabsVatCoefficient,
    },
];
