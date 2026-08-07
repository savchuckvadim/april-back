/**
 * Нормализация сигналов. Без неё поиск дублей не работает: один и тот же
 * телефон записан как `+7 (999) 123-45-67`, `89991234567` и `9991234567`,
 * а ИНН может быть вписан в название компании вперемешку с текстом.
 */

/**
 * Организационно-правовые формы, которые не несут смысла при сравнении
 * названий. Убираем их не регэкспом с `\b` (в JS граница слова считается по
 * ASCII и на кириллице не срабатывает), а отбрасыванием целых токенов.
 */
const LEGAL_FORMS = new Set([
    'ооо',
    'оао',
    'зао',
    'пао',
    'нао',
    'ао',
    'ип',
    'пбоюл',
    'гуп',
    'муп',
    'фгуп',
    'нко',
    'ано',
    'тсж',
    'снт',
    'ltd',
    'llc',
    'inc',
    'gmbh',
]);

/**
 * Телефон → последние 10 цифр.
 *
 * Именно 10: так `+79991234567`, `89991234567` и `9991234567` схлопываются в
 * один ключ. crm.duplicate.findbycomm тоже игнорирует префикс страны и
 * добавочный номер, поэтому формат совпадает с тем, что ждёт Битрикс.
 * Короче 10 цифр (внутренние номера) — не сигнал, вернём null.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const digits = String(raw).replace(/\D/g, '');
    if (digits.length < 10) return null;
    return digits.slice(-10);
}

/** Email → trim + lowercase; мусор без `@` отбрасываем. */
export function normalizeEmail(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const value = String(raw).trim().toLowerCase();
    if (!value || !value.includes('@') || value.length < 5) return null;
    return value;
}

/**
 * Название → lowercase без кавычек, ОПФ и лишних пробелов.
 * `ООО "Ромашка-Плюс"` и `Ромашка Плюс` дают одну строку.
 */
export function normalizeTitle(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const value = String(raw)
        .toLowerCase()
        .replace(/[^a-zа-яё0-9]+/gi, ' ')
        .trim()
        .split(/\s+/)
        .filter(token => token && !LEGAL_FORMS.has(token))
        .join(' ');
    // Огрызки после чистки ОПФ («ООО», «ИП "А"») — не сигнал.
    return value.length >= 3 ? value : null;
}

/**
 * ИНН → строка цифр, если она валидна по контрольной сумме.
 *
 * Проверка суммы обязательна: ИНН мы вытаскиваем в том числе из свободного
 * текста (названия, комментарии таймлайна), и без неё любой десятизначный
 * номер телефона превратился бы в «ИНН» и дал ложные дубли.
 */
export function normalizeInn(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const digits = String(raw).replace(/\D/g, '');
    return isValidInn(digits) ? digits : null;
}

/**
 * Все валидные ИНН из значения поля.
 *
 * Легаси-поля хранят СПИСКИ — «7707083893, 500100732259», через слэш,
 * с префиксами «ИНН». Одиночный normalizeInn склеивал все цифры в одну
 * строку и молча терял оба значения. Сначала пробуем как одиночный
 * (обычный случай, дешевле), затем — извлечение всех валидных из текста.
 */
export function normalizeInnList(raw: string | null | undefined): string[] {
    if (!raw) return [];
    const single = normalizeInn(raw);
    if (single) return [single];
    return extractInnFromText(String(raw));
}

/** Контрольная сумма ИНН: 10 знаков — юрлицо, 12 — физлицо/ИП. */
export function isValidInn(digits: string): boolean {
    if (!/^\d+$/.test(digits)) return false;
    if (digits.length === 10) {
        return checksum(digits, [2, 4, 10, 3, 5, 9, 4, 6, 8]) === +digits[9];
    }
    if (digits.length === 12) {
        const n11 = checksum(digits, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]);
        const n12 = checksum(digits, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]);
        return n11 === +digits[10] && n12 === +digits[11];
    }
    return false;
}

function checksum(digits: string, weights: number[]): number {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
        sum += weights[i] * +digits[i];
    }
    return (sum % 11) % 10;
}

/**
 * Все валидные ИНН, встречающиеся в свободном тексте.
 * Используется для названий («ООО Ромашка ИНН 7707083893») и таймлайна.
 */
export function extractInnFromText(text: string | null | undefined): string[] {
    if (!text) return [];
    const found = new Set<string>();
    for (const match of String(text).matchAll(/\d{10,12}/g)) {
        const chunk = match[0];
        // 11 цифр — не ИНН, но внутри может лежать валидный 10- или 12-значный.
        for (const candidate of [chunk, chunk.slice(0, 10), chunk.slice(-10)]) {
            if (isValidInn(candidate)) found.add(candidate);
        }
    }
    return [...found];
}

/**
 * ИНН из названия сущности.
 *
 * Отличается от `extractInnFromText` одним правилом: числа в скобках
 * игнорируются. В лидах с сайта номер заявки пишут именно так —
 * «Заявка с сайта (123123213)», и он не имеет к ИНН отношения. Контрольной
 * суммы тут мало: десятизначный номер заявки проходит её примерно в одном
 * случае из одиннадцати, а цена ошибки — ложный дубль у менеджера.
 */
export function extractInnFromTitle(
    title: string | null | undefined,
): string[] {
    if (!title) return [];
    return extractInnFromText(String(title).replace(/\([^)]*\)/g, ' '));
}

/**
 * Все телефоны, встречающиеся в свободном тексте (для скана таймлайна).
 *
 * В свободном тексте рядом лежат даты и суммы, поэтому мало вытащить 10 цифр:
 * `2026-08-03 10:00` тоже даст десять. Берём только то, что выглядит как
 * реальный номер — с явным `+`, либо 11 цифр с 7/8 в начале, либо российский
 * мобильный (10 цифр, начинается с 9).
 */
export function extractPhonesFromText(
    text: string | null | undefined,
): string[] {
    if (!text) return [];
    const found = new Set<string>();
    const re = /\+?\d[\d\s\-()]{8,}\d/g;
    for (const match of String(text).matchAll(re)) {
        const chunk = match[0];
        const digits = chunk.replace(/\D/g, '');
        const looksLikePhone =
            chunk.includes('+') ||
            (digits.length === 11 && /^[78]/.test(digits)) ||
            (digits.length === 10 && digits.startsWith('9'));
        if (!looksLikePhone) continue;

        const phone = normalizePhone(chunk);
        if (phone) found.add(phone);
    }
    return [...found];
}

/** Уникализация с сохранением порядка — сигналы не должны дублироваться. */
export function uniq<T>(items: readonly T[]): T[] {
    return [...new Set(items)];
}

/**
 * Стабильный ключ набора сигналов — им кэшируем результат поиска, чтобы
 * повторный вызов из фрейма в пределах TTL не ходил в Битрикс вообще.
 */
export function signalsCacheKey(signals: {
    phones: string[];
    emails: string[];
    inns: string[];
    titles: string[];
}): string {
    const part = (items: string[]) => [...items].sort().join(',');
    return [
        part(signals.phones),
        part(signals.emails),
        part(signals.inns),
        part(signals.titles),
    ].join('|');
}
