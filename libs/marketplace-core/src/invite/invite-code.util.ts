import { createHash, randomBytes } from 'node:crypto';

/**
 * Код подключения портала к внешнему сервису April.
 *
 * ОБЩИЙ код для двух приложений: admin ВЫПУСКАЕТ код, pbx ПОГАШАЕТ его.
 * Генерация, нормализация и хэширование обязаны совпадать бит в бит,
 * иначе выпущенный код не сойдётся с введённым — поэтому они здесь,
 * в общей либе, а не продублированы в каждом приложении.
 *
 * Сам код НИКОГДА не хранится: в БД лежит только sha256-hex (как у
 * personal_access_tokens), открытый текст показывается админу один раз
 * при выпуске и уходит в письмо.
 */

/**
 * Алфавит Crockford base32 БЕЗ визуально похожих символов
 * (нет 0/O, 1/I/L, U) — код диктуют по телефону и переписывают руками.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Префикс кода — маркер приложения «Менеджер Гарант» */
const CODE_PREFIX = 'GRNT';

/** Количество значащих символов (2 группы по 4) ≈ 39 бит энтропии */
const CODE_BODY_LENGTH = 8;

/**
 * Новый код вида `GRNT-XXXX-XXXX`.
 * Источник случайности — crypto.randomBytes (НЕ Math.random).
 * Отбрасываем байты, не попавшие в целое число диапазонов алфавита,
 * чтобы распределение символов осталось равномерным.
 */
export function generateInviteCode(): string {
    const maxUnbiased =
        Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
    let body = '';
    while (body.length < CODE_BODY_LENGTH) {
        for (const byte of randomBytes(CODE_BODY_LENGTH)) {
            if (body.length === CODE_BODY_LENGTH) {
                break;
            }
            if (byte < maxUnbiased) {
                body += CODE_ALPHABET[byte % CODE_ALPHABET.length];
            }
        }
    }
    return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/**
 * Приведение к каноничному виду перед сравнением: верхний регистр,
 * без пробелов и дефисов. Пользователь может ввести «grnt ab12 cd34»,
 * «GRNT-AB12-CD34» или «grntab12cd34» — все варианты эквивалентны.
 */
export function normalizeInviteCode(raw: string): string {
    return raw.replace(/[\s-]/g, '').toUpperCase();
}

/** sha256-hex от нормализованного кода — то, что хранится в БД */
export function hashInviteCode(raw: string): string {
    return createHash('sha256').update(normalizeInviteCode(raw)).digest('hex');
}

/**
 * Видимая часть кода для списков админки (`GRNT-AB12`): позволяет найти
 * запись по началу кода, не раскрывая его целиком.
 */
export function inviteCodePrefix(code: string): string {
    const normalized = normalizeInviteCode(code);
    return `${CODE_PREFIX}-${normalized.slice(CODE_PREFIX.length, CODE_PREFIX.length + 4)}`;
}
