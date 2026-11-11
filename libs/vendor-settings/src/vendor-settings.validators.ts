/**
 * Проверки значений настроек вендора перед сохранением в админке и разбор
 * чисел при чтении. Отдельный файл: ими пользуются и реестр, и файлы групп
 * (Telegram-боты, шлюз модели) — без циклического импорта через реестр.
 */

const HOST_RE = /^\.?[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/** Пусто — нормально (настройка снимается); непустое значение проверяем. */
export const validateUrl = (value: string): string | null => {
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        return 'Адрес должен начинаться с https:// и быть полным, например https://eu-proxy.april-app.ru/p';
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return 'Адрес должен начинаться с https://';
    }
    return null;
};

export const validateHosts = (value: string): string | null => {
    const hosts = value
        .split(',')
        .map(host => host.trim())
        .filter(Boolean);
    if (!hosts.length) {
        return 'Укажите хотя бы один хост, например api.groq.com';
    }
    const bad = hosts.find(host => !HOST_RE.test(host));
    return bad
        ? `«${bad}» не похоже на имя хоста: нужно вроде api.groq.com или .googleapis.com, без https:// и путей`
        : null;
};

/** Целочисленная настройка: допустимый диапазон и значение, когда не задано. */
export interface IntegerSettingRule {
    min: number;
    max: number;
    defaultValue: number;
}

/** Целое без знака; пробелы и «_» между разрядами допустимы («180 000»). */
function parseInteger(value: string): number | null {
    const digits = value.trim().replace(/[\s_]/g, '');
    if (!/^\d+$/.test(digits)) return null;
    const parsed = Number(digits);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

/** 300000 → «300 000»: без Intl, чтобы текст не зависел от ICU сервера. */
const groupDigits = (value: number): string =>
    String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Проверка для админки: целое число в диапазоне правила. */
export function integerInRange(
    rule: IntegerSettingRule,
): (value: string) => string | null {
    return value => {
        const parsed = parseInteger(value);
        return parsed !== null && parsed >= rule.min && parsed <= rule.max
            ? null
            : `Нужно целое число от ${groupDigits(rule.min)} до ${groupDigits(rule.max)}`;
    };
}

/**
 * Значение целочисленной настройки при чтении. Не число — значение по
 * умолчанию; число вне диапазона — ближайшая граница. Так старое значение
 * env (там проверки не было) не роняет приложение и не превращается в
 * неожиданный дефолт: 600000 у таймаута станет потолком 300000, а не 180000.
 */
export function integerSettingValue(
    raw: string | null | undefined,
    rule: IntegerSettingRule,
): number {
    const parsed = parseInteger(raw ?? '');
    if (parsed === null) return rule.defaultValue;
    return Math.min(rule.max, Math.max(rule.min, parsed));
}

/** Проверка для админки: одно из допустимых значений. */
export function oneOf(
    values: readonly string[],
): (value: string) => string | null {
    return value =>
        values.includes(value) ? null : `Допустимо: ${values.join(' или ')}`;
}
