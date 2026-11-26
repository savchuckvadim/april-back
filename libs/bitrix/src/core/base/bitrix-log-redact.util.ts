/**
 * Тело запроса к Битриксу для лога без содержимого файлов.
 *
 * Загрузка на Диск (`disk.folder.uploadfile`) и поля-файлы CRM несут файл
 * как base64 внутри самого запроса. В строке «Error calling Bitrix» такое
 * тело раньше печаталось первой тысячей символов: в журнал попадало начало
 * документа клиента, и за base64 терялись имя файла и его размер. Здесь
 * содержимое заменяется на «<N байт>», остальное тело остаётся как было.
 */

/** Ключи запроса, под которыми Битрикс принимает файл: `[имя, base64]`. */
const FILE_CONTENT_KEYS: ReadonlySet<string> = new Set([
    'filecontent',
    'filedata',
]);

/**
 * Длинная серия символов base64 внутри строки. Порог в 200 знаков отсекает
 * обычные идентификаторы и слова; серия может быть url-кодированной
 * (`%2B`, `%2F`, `%3D`) — так файл едет в командах пачки (batch).
 */
const BASE64_RUN =
    /(?:[A-Za-z0-9+/]|%2[BbFf]){200,}(?:={1,2}|(?:%3[Dd]){1,2})?/g;

/** Глубже обход не идёт: тело запроса не бывает вложеннее, и цикл не зависнет. */
const MAX_DEPTH = 8;

/** Размер файла в байтах по его base64 (в том числе url-кодированному). */
export const base64ByteSize = (base64: string): number => {
    const clean = base64
        .replace(/%2B/gi, '+')
        .replace(/%2F/gi, '/')
        .replace(/%3D/gi, '=')
        .replace(/\s/g, '');
    const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
};

const sizeLabel = (bytes: number): string => `<${bytes} байт>`;

const isFileContentKey = (key: string | null): boolean =>
    key !== null && FILE_CONTENT_KEYS.has(key.toLowerCase());

const redact = (value: unknown, key: string | null, depth: number): unknown => {
    if (typeof value === 'string') {
        return isFileContentKey(key)
            ? sizeLabel(base64ByteSize(value))
            : value.replace(BASE64_RUN, run => sizeLabel(base64ByteSize(run)));
    }
    if (Buffer.isBuffer(value)) return sizeLabel(value.length);
    if (typeof value !== 'object' || value === null) return value;
    if (depth >= MAX_DEPTH) return '[…]';

    const withToJson = value as { toJSON?: () => unknown };
    if (typeof withToJson.toJSON === 'function') {
        return redact(withToJson.toJSON(), key, depth + 1);
    }
    if (Array.isArray(value)) {
        const isFile = isFileContentKey(key);
        // `[имя, base64]`: имя файла остаётся, содержимое уходит
        return value.map((item: unknown, index) =>
            isFile && index > 0 && typeof item === 'string'
                ? sizeLabel(base64ByteSize(item))
                : redact(item, null, depth + 1),
        );
    }
    return Object.fromEntries(
        Object.entries(value).map(([entryKey, entryValue]) => [
            entryKey,
            redact(entryValue, entryKey, depth + 1),
        ]),
    );
};

/**
 * Копия тела запроса, в которой содержимое файлов заменено на «<N байт>».
 * Исходный объект не меняется (по нему уходит сам запрос). Сбой обхода
 * отчёт об ошибке не роняет и содержимое в лог не пропускает: вместо тела
 * пишется пометка.
 */
export const redactBitrixPayload = (data: unknown): unknown => {
    try {
        return redact(data, null, 0);
    } catch {
        return '[тело запроса скрыто: не удалось обработать]';
    }
};
