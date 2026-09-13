/**
 * Разбор ЗНАЧЕНИЙ полей Bitrix, которые приходят в нескольких формах.
 *
 * Битрикс не нормализует ответ: одно и то же «да» у boolean-поля прилетает
 * как `1`, `'1'`, `'Y'`, `true` или `'true'` — в зависимости от того, каким
 * путём поле заполнили (робот БП, REST, ручной ввод в карточке). Пустое
 * значение точно так же бывает `''`, `false`, `'0'`, `null` и `[]`.
 *
 * До появления этого модуля каждый потребитель писал свой ad-hoc разбор
 * (их набралось пять, и они расходились в деталях: где-то не учитывался
 * `true`, где-то `'0'` считался заполненным). Здесь один канон.
 */

/** Формы, которыми Bitrix отдаёт «да» у boolean-поля. */
const TRUTHY = new Set(['1', 'Y', 'TRUE', 'YES']);

/** Формы, которыми Bitrix отдаёт «нет»/«не заполнено». */
const FALSY = new Set(['', '0', 'N', 'FALSE', 'NO']);

/**
 * Первое скалярное значение поля: multiple-поля приходят массивом, и брать
 * из них нужно первый элемент, а не сериализовать массив целиком.
 */
function firstScalar(raw: unknown): string | number | boolean | null {
    const value: unknown = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    // Объект здесь означал бы другую форму ответа, а не значение — в текст
    // его не превращаем, иначе получим '[object Object]'.
    return null;
}

/**
 * Непустой текст значения поля либо null.
 *
 * `'0'` трактуется как «не заполнено»: именно так Битрикс отдаёт пустое
 * `employee`-поле, а «ноль» как осмысленный текст в наших полях не хранится.
 * Для boolean-полей используйте {@link isBxTrue} — там `'0'` значим.
 */
export function bxFieldText(raw: unknown): string | null {
    const value = firstScalar(raw);
    if (value === null) return null;
    if (typeof value === 'boolean') return value ? 'Y' : null;
    const text = String(value).trim();
    return text === '' || text === '0' ? null : text;
}

/** Положительный id (сотрудник, сущность) либо null. */
export function bxFieldId(raw: unknown): number | null {
    const text = bxFieldText(raw);
    if (text === null) return null;
    const id = Number(text);
    return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Boolean-поле Bitrix → `true` / `false` / null.
 *
 * @returns null, когда поле НЕ ЗАПОЛНЕНО — это отличается от `false`
 *   («заполнено и снято») и нужно вызывающему, чтобы понять, применять ли
 *   дефолт. Нераспознанное значение тоже null: молча считать мусор за
 *   `false` опаснее, чем уйти в дефолт.
 */
export function bxFieldBool(raw: unknown): boolean | null {
    const value = firstScalar(raw);
    if (value === null) return null;
    if (typeof value === 'boolean') return value;
    const text = String(value).trim().toUpperCase();
    if (text === '') return null;
    if (TRUTHY.has(text)) return true;
    if (FALSY.has(text)) return false;
    return null;
}

/** Boolean-поле → строгий `true`; «не заполнено» и мусор считаются `false`. */
export function isBxTrue(raw: unknown): boolean {
    return bxFieldBool(raw) === true;
}

/** Boolean-поле → флаг хука `'Y'` / `'N'`; не заполнено → null. */
export function bxFieldFlag(raw: unknown): 'Y' | 'N' | null {
    const value = bxFieldBool(raw);
    if (value === null) return null;
    return value ? 'Y' : 'N';
}
