/**
 * Команда пакета фрейма → строка `cmd` для метода Битрикса `batch`.
 *
 * Фронт хранит команды пакета объектами `{ method, params }` (так их ест
 * SDK во фрейме). Сервер шлёт `batch` сам, поэтому собирает строку запроса
 * по правилам PHP `http_build_query`: значения и ключи кодируются, пустые
 * массивы опускаются, булевы — 1/0. Ссылка на результат соседней команды
 * (`$result[deal]`, `$result[deal][ID]`) остаётся как есть — иначе Битрикс
 * её не подставит.
 */

/** Значение целиком — ссылка на результат другой команды пакета. */
const RESULT_REF = /^\$result(_error|_total|_next)?\[[^\]]+\](\[[^\]]*\])*$/;

const encodeValue = (value: string): string =>
    RESULT_REF.test(value) ? value : encodeURIComponent(value);

const scalarText = (value: unknown): string | null => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'bigint') {
        return String(value);
    }
    if (typeof value === 'boolean') return value ? '1' : '0';
    return null;
};

export function toBatchCommand(
    method: string,
    params: Record<string, unknown> = {},
): string {
    const parts: string[] = [];

    const walk = (key: string, value: unknown): void => {
        if (value === undefined) return;
        if (value === null) {
            parts.push(`${key}=`);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((item, index) => walk(`${key}[${index}]`, item));
            return;
        }
        if (typeof value === 'object') {
            for (const [sub, item] of Object.entries(
                value as Record<string, unknown>,
            )) {
                walk(`${key}[${encodeURIComponent(sub)}]`, item);
            }
            return;
        }
        const text = scalarText(value);
        if (text !== null) parts.push(`${key}=${encodeValue(text)}`);
    };

    for (const [key, value] of Object.entries(params)) {
        walk(encodeURIComponent(key), value);
    }
    return parts.length ? `${method}?${parts.join('&')}` : method;
}
