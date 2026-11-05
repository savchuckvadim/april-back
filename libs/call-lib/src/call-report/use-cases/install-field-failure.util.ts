/**
 * Причины отказов userfieldconfig.add при установке полей смарта
 * «AI-анализ звонков».
 *
 * Прод-урок 02.11.2026 (gsr): смарт упёрся в лимит пользовательских полей
 * Битрикс24 (MAIN_USER_FIELD_LIMIT_EXCEEDED), а админка советовала
 * «проверить права вебхука» и слала четыре алерта на одно нажатие. Лимит —
 * состояние сущности на портале, а не ошибка кода: причину нужно назвать
 * словами, а после первого такого отказа остальные поля не пробовать.
 * 03.11.2026 проверено пробой: лимит считается НА ОДНУ СУЩНОСТЬ (в пустой
 * смарт того же портала поле создаётся, в AI-смарт со 112 полями — нет);
 * удаление полей в других смартах и сделках не помогает.
 *
 * Чистые функции без сети — правило проверяемо тестом.
 */
import { BITRIX_USER_FIELD_LIMIT_CODE } from '@lib/bitrix/core/base/bitrix-benign-error.util';

export const INSTALL_FIELD_FAILURE_REASONS = [
    'field_limit',
    'network',
    'other',
] as const;

export type InstallFieldFailureReason =
    (typeof INSTALL_FIELD_FAILURE_REASONS)[number];

/** Отказ создания одного поля смарта — что именно и почему. */
export interface InstallFieldFailure {
    /** UF-имя поля на портале (UF_CRM_7_DEAL_PROGRESS). */
    fieldName: string;
    /** Название поля по-русски из конфига смарта. */
    title: string;
    reason: InstallFieldFailureReason;
    /** Описание ошибки Битрикса, иначе текст исключения. */
    message: string;
}

/** Поле не пробовали создавать: лимит полей смарта достигнут в этой же установке. */
export const LIMIT_SKIPPED_MESSAGE =
    'не создавалось: лимит пользовательских полей этого смарта уже достигнут';

/** Обрывы сети и таймауты — повтор через минуту обычно помогает. */
const NETWORK_ERROR_TEXT =
    /socket hang up|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|timeout of \d+ms|Network Error/i;

interface BitrixErrorBody {
    error?: unknown;
    error_description?: unknown;
}

/**
 * Тело ответа Битрикса из AxiosError: у него `message` —
 * «Request failed with status code 400», а код и описание лежат в
 * `response.data` (прод-урок 06.08.2026 по row size).
 */
function responseBody(error: unknown): BitrixErrorBody | string | null {
    if (typeof error !== 'object' || error === null) return null;
    const data = (error as { response?: { data?: unknown } }).response?.data;
    if (typeof data === 'string') return data;
    if (typeof data === 'object' && data !== null) {
        return data as BitrixErrorBody;
    }
    return null;
}

function bodyText(body: BitrixErrorBody | string | null): string {
    if (body === null) return '';
    return typeof body === 'string' ? body : JSON.stringify(body);
}

/** Человеческое описание из тела Битрикса, иначе текст исключения. */
function describe(
    error: unknown,
    body: BitrixErrorBody | string | null,
): string {
    if (typeof body === 'object' && body !== null) {
        if (
            typeof body.error_description === 'string' &&
            body.error_description
        ) {
            return body.error_description;
        }
        if (typeof body.error === 'string' && body.error) return body.error;
    }
    if (typeof body === 'string' && body) return body;
    return error instanceof Error ? error.message : String(error);
}

/** Причина отказа создания поля по ошибке библиотеки Битрикса. */
export function classifyInstallFieldError(
    error: unknown,
): Pick<InstallFieldFailure, 'reason' | 'message'> {
    const body = responseBody(error);
    const message = describe(error, body);
    const haystack = `${error instanceof Error ? error.message : String(error)} ${bodyText(body)}`;
    if (haystack.includes(BITRIX_USER_FIELD_LIMIT_CODE)) {
        return { reason: 'field_limit', message };
    }
    if (NETWORK_ERROR_TEXT.test(haystack)) {
        return { reason: 'network', message };
    }
    return { reason: 'other', message };
}

/** Одна строка в лог вместо алерта на каждое поле. */
export function fieldLimitSummary(
    domain: string,
    failures: readonly InstallFieldFailure[],
): string {
    const titles = failures
        .filter(failure => failure.reason === 'field_limit')
        .map(failure => `«${failure.title}»`)
        .join(', ');
    return (
        `Смарт «AI-анализ звонков» на ${domain} достиг лимита пользовательских полей ` +
        `Битрикс24 (лимит считается на одну сущность) — не созданы: ${titles}. ` +
        'Разбор звонков работает без них (сводка методики идёт в таймлайн); ' +
        'удалите неиспользуемые поля в самом смарте и повторите установку.'
    );
}

/** Часть итога установки полей, которую сверяет {@link reconcileFailedFields}. */
export interface InstallFieldsFailures {
    fieldsExisting: readonly string[];
    fieldsFailed: readonly string[];
    fieldsFailedDetails: readonly InstallFieldFailure[];
}

/** Итог сверки: отказы без полей, которые на деле есть на портале. */
export interface ReconciledInstallFields {
    fieldsExisting: string[];
    fieldsFailed: string[];
    fieldsFailedDetails: InstallFieldFailure[];
    fieldLimitReached: boolean;
    /** Поля из отказов, которые на деле есть на портале. */
    recovered: string[];
}

/**
 * Сверка отказов с тем, что реально есть на портале после цикла установки.
 *
 * Прод gsirk 05.11.2026: окно установки показало шесть полей «не удалось
 * создать», а через несколько минут все 112 полей были на портале. Так
 * бывает, когда вторая установка идёт параллельно первой (повторное
 * нажатие, пока первая ещё доливает поля) или когда Битрикс создал поле,
 * а ответ потерялся. Поле, которое есть на портале, — не отказ: оно уходит
 * в «уже существовали», а его причина снимается.
 */
export function reconcileFailedFields(
    outcome: InstallFieldsFailures,
    presentNames: ReadonlySet<string>,
): ReconciledInstallFields {
    const recovered = outcome.fieldsFailed.filter(name =>
        presentNames.has(name),
    );
    const fieldsFailedDetails = outcome.fieldsFailedDetails.filter(
        failure => !presentNames.has(failure.fieldName),
    );
    return {
        fieldsExisting: [...outcome.fieldsExisting, ...recovered],
        fieldsFailed: outcome.fieldsFailed.filter(
            name => !presentNames.has(name),
        ),
        fieldsFailedDetails,
        fieldLimitReached: fieldsFailedDetails.some(
            failure => failure.reason === 'field_limit',
        ),
        recovered,
    };
}
