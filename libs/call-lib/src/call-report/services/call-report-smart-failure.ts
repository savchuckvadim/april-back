import { bitrixErrorText } from '@lib/bitrix';

/**
 * Текст отказа записи в смарт-процесс: к сообщению ошибки добавляется то,
 * что ответил Битрикс.
 *
 * У ошибки axios `message` — только «Request failed with status code 400»,
 * а причина лежит в ТЕЛЕ ответа (`{ error, error_description }`). Без неё в
 * журнале и в тревоге «Элемент #799 не обновлён» нельзя было отличить
 * переполнение строки от запрета или кривого значения (garantservisvoronezh,
 * 20.11.2026). Берётся только код и описание ответа — ни адрес запроса (в нём
 * ключ вебхука), ни поля запроса (данные клиентов) в текст не попадают.
 */

/** Не длиннее этого описание ответа Битрикса в тексте отказа. */
export const SMART_FAILURE_RESPONSE_MAX_CHARS = 300;

const messageOf = (error: unknown): string => {
    const message = (error as { message?: unknown } | null)?.message;
    return typeof message === 'string' ? message : String(error);
};

/**
 * Сообщение ошибки и, если Битрикс ответил телом, его описание:
 * «Request failed with status code 400 — ответ Битрикса: 400: Internal
 * server error.». Тела нет — просто сообщение.
 */
export function describeSmartWriteFailure(error: unknown): string {
    const message = messageOf(error);
    const response = bitrixErrorText(error).trim();
    if (!response || response === message) return message;
    return (
        `${message} — ответ Битрикса: ` +
        response.slice(0, SMART_FAILURE_RESPONSE_MAX_CHARS)
    );
}

/**
 * Ошибка для проброса наружу с тем же описанием. Описания ответа нет —
 * возвращается сама ошибка (ничего не меняется); есть — новая `Error` с
 * дополненным сообщением и исходной ошибкой в `cause`. Не-`Error` (строка,
 * объект без класса) оборачивается в `Error`, чтобы бросать было что.
 */
export function withBitrixResponse(error: unknown): Error {
    const text = describeSmartWriteFailure(error);
    if (error instanceof Error && text === error.message) return error;
    return new Error(text, { cause: error });
}
