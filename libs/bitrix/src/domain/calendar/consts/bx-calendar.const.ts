/**
 * Константы домена календаря (calendar.settings.get).
 * Значения — строго из официальной документации метода:
 * https://apidocs.bitrix24.ru/api-reference/calendar/calendar-settings-get.html
 */

/** Коды дней недели, которыми портал описывает выходные (week_holidays). */
export const BX_CALENDAR_WEEK_DAY_CODES = [
    'MO',
    'TU',
    'WE',
    'TH',
    'FR',
    'SA',
    'SU',
] as const;

/** Код дня недели портала: 'MO' … 'SU'. */
export type BxCalendarWeekDayCode = (typeof BX_CALENDAR_WEEK_DAY_CODES)[number];

/** Код дня недели -> индекс Date#getDay (0 — воскресенье). */
export const BX_CALENDAR_WEEK_DAY_INDEX = {
    SU: 0,
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6,
} as const satisfies Record<BxCalendarWeekDayCode, number>;

/**
 * Причины отказа calendar.settings.get — потребитель различает их,
 * чтобы деградировать на производственный календарь РФ, а не падать.
 */
export const BX_CALENDAR_FAILURE_REASONS = [
    /** Портал/ключ без права calendar (ACCESS_DENIED, insufficient_scope). */
    'access-denied',
    /** Метода нет на портале (ERROR_METHOD_NOT_FOUND) — коробка без календаря. */
    'method-not-found',
    /** Ответ пришёл, но без ожидаемых полей настроек. */
    'invalid-response',
    /** Сеть, таймаут, 5xx и прочие сбои вызова. */
    'request-failed',
] as const;

/** Причина отказа calendar.settings.get. */
export type BxCalendarFailureReason =
    (typeof BX_CALENDAR_FAILURE_REASONS)[number];

/**
 * Отказы «метод недоступен этому порталу» (в отличие от временного сбоя):
 * повтор не поможет, нужен запасной производственный календарь.
 */
export const BX_CALENDAR_UNAVAILABLE_REASONS = [
    'access-denied',
    'method-not-found',
] as const;

/** Маркеры кодов ошибок Битрикс -> причина отказа. */
const FAILURE_MARKERS: ReadonlyArray<
    readonly [marker: string, reason: BxCalendarFailureReason]
> = [
    ['ERROR_METHOD_NOT_FOUND', 'method-not-found'],
    ['METHOD_NOT_FOUND', 'method-not-found'],
    ['ACCESS_DENIED', 'access-denied'],
    ['INSUFFICIENT_SCOPE', 'access-denied'],
    ['INVALID_TOKEN', 'access-denied'],
    ['NO_AUTH_FOUND', 'access-denied'],
    ['AUTHORIZATION_ERROR', 'access-denied'],
];

/** Причина отказа по коду/описанию ошибки Битрикс (регистр не важен). */
export function bxCalendarReasonByCode(
    code: string | null,
    description: string | null,
): BxCalendarFailureReason {
    const haystack = `${code ?? ''} ${description ?? ''}`.toUpperCase();
    const found = FAILURE_MARKERS.find(([marker]) => haystack.includes(marker));
    return found ? found[1] : 'request-failed';
}

/** Отказ означает «метода нет у портала» — деградируем без повторов. */
export function isBxCalendarUnavailable(
    reason: BxCalendarFailureReason,
): boolean {
    return BX_CALENDAR_UNAVAILABLE_REASONS.some(item => item === reason);
}

/** Проверка кода дня недели портала. */
export function isBxCalendarWeekDayCode(
    value: string,
): value is BxCalendarWeekDayCode {
    return BX_CALENDAR_WEEK_DAY_CODES.some(code => code === value);
}
