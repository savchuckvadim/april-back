import {
    BxCalendarFailureReason,
    bxCalendarReasonByCode,
} from '../consts/bx-calendar.const';
import {
    IBXCalendarSettings,
    IBXCalendarSettingsFailure,
} from '../interface/bx-calendar.interface';

/** Тело ошибки REST Битрикс: { error, error_description }. */
interface IBxErrorBody {
    error?: unknown;
    error_description?: unknown;
}

/** Строка или null: коды и описания ошибок Битрикс приходят строками. */
function asText(value: unknown): string | null {
    if (typeof value === 'string' && value.length > 0) return value;
    return null;
}

/** Тело ответа с ошибкой: у axios оно лежит в error.response.data. */
function errorBodyOf(error: unknown): IBxErrorBody | null {
    if (!error || typeof error !== 'object') return null;
    const response = (error as { response?: unknown }).response;
    if (response && typeof response === 'object') {
        const data = (response as { data?: unknown }).data;
        if (data && typeof data === 'object') return data as IBxErrorBody;
    }
    return error as IBxErrorBody;
}

/**
 * Любое исключение вызова -> типизированный отказ домена.
 * Нужен, чтобы потребитель отличал «у портала нет прав/метода»
 * (деградация на производственный календарь РФ) от временного сбоя.
 */
export function toBxCalendarFailure(
    error: unknown,
): IBXCalendarSettingsFailure {
    const body = errorBodyOf(error);
    const code = asText(body?.error);
    const description =
        asText(body?.error_description) ??
        asText((error as { message?: unknown })?.message);
    const reason: BxCalendarFailureReason = bxCalendarReasonByCode(
        code,
        description,
    );
    return { ok: false, reason, code, description };
}

/**
 * Ответ действительно похож на настройки календаря: производственный
 * календарь читается из week_holidays / year_holidays / work_time_*,
 * поэтому проверяются именно эти поля (остальные не обязательны).
 */
export function isBXCalendarSettings(
    value: unknown,
): value is IBXCalendarSettings {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<IBXCalendarSettings>;
    const weekHolidays = candidate.week_holidays;
    if (
        !Array.isArray(weekHolidays) ||
        weekHolidays.some(day => typeof day !== 'string')
    ) {
        return false;
    }
    if (typeof candidate.year_holidays !== 'string') return false;
    return isHour(candidate.work_time_start) && isHour(candidate.work_time_end);
}

/** Час рабочего дня: документация обещает строку, порталы шлют и число. */
function isHour(value: unknown): value is string | number {
    if (typeof value === 'number') return Number.isFinite(value);
    return typeof value === 'string' && value.trim().length > 0;
}
