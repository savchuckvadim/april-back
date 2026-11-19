/**
 * Время ожидания Яндекса SpeechKit — чистые правила без DI (19.11.2026).
 *
 * Задание TRANSCRIBE в Bull не должно истекать раньше, чем закончится
 * ожидание Яндекса: Bull по таймауту НЕ останавливает обработчик, а
 * запускает вторую попытку параллельно первой — и та отправляла звонок в
 * Яндекс повторно (каждая операция оплачивается). Поэтому таймаут задания
 * считается из тех же настроек, что и само ожидание: слот + отправка +
 * опрос + запас на скачивание записи и загрузку в Object Storage.
 */

/** Чтение настройки по ключу env (ConfigService.get). */
export type SettingReader = (key: string) => string | undefined;

/** Терпимость к сбоям Яндекса (env, см. apps/event-sales/.env.example). */
export interface YandexSttTolerance {
    pollDelayMs: number;
    pollMaxAttempts: number;
    /** Сколько ПОДРЯД временных сбоев терпим до отказа — на отправке и на опросе. */
    transientRetries: number;
    retryBaseMs: number;
}

export const YANDEX_STT_DEFAULT_TOLERANCE: Readonly<YandexSttTolerance> = {
    pollDelayMs: 3000,
    pollMaxAttempts: 700,
    transientRetries: 5,
    retryBaseMs: 2000,
};

/** Потолок паузы между повторами при удвоении. */
export const YANDEX_RETRY_MAX_MS = 30_000;

/** Сколько по умолчанию звонок ждёт свободного слота Яндекса в процессе. */
export const YANDEX_SLOT_WAIT_DEFAULT_MS = 20 * 60_000;

/** Запас на один запрос опроса (сеть, IAM-токен) сверх паузы между опросами. */
const POLL_REQUEST_ALLOWANCE_MS = 500;

/** Запас на скачивание записи из Битрикса, загрузку в Object Storage и запись в БД. */
const TRANSCRIBE_MARGIN_MS = 10 * 60_000;

/** Неотрицательное число из env; пусто или мусор — значение по умолчанию. */
export function numberSetting(
    read: SettingReader,
    key: string,
    fallback: number,
): number {
    const raw = read(key);
    const value = raw === undefined || raw === '' ? NaN : Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Терпимость к сбоям Яндекса из env (YANDEX_STT_*). */
export function readYandexSttTolerance(
    read: SettingReader,
): YandexSttTolerance {
    const defaults = YANDEX_STT_DEFAULT_TOLERANCE;
    return {
        pollDelayMs: numberSetting(
            read,
            'YANDEX_STT_POLL_DELAY_MS',
            defaults.pollDelayMs,
        ),
        pollMaxAttempts: numberSetting(
            read,
            'YANDEX_STT_POLL_MAX_ATTEMPTS',
            defaults.pollMaxAttempts,
        ),
        transientRetries: numberSetting(
            read,
            'YANDEX_STT_TRANSIENT_RETRIES',
            defaults.transientRetries,
        ),
        retryBaseMs: numberSetting(
            read,
            'YANDEX_STT_RETRY_BASE_MS',
            defaults.retryBaseMs,
        ),
    };
}

/** Сколько звонок ждёт слота Яндекса (env TRANSCRIPTION_YANDEX_SLOT_WAIT_MS). */
export function readYandexSlotWaitMs(read: SettingReader): number {
    return numberSetting(
        read,
        'TRANSCRIPTION_YANDEX_SLOT_WAIT_MS',
        YANDEX_SLOT_WAIT_DEFAULT_MS,
    );
}

/** Пауза перед повтором номер `failures` (с 1): удвоение до потолка. */
export function yandexBackoffMs(
    tolerance: Pick<YandexSttTolerance, 'retryBaseMs'>,
    failures: number,
): number {
    return Math.min(
        tolerance.retryBaseMs * 2 ** (failures - 1),
        YANDEX_RETRY_MAX_MS,
    );
}

/** Сумма пауз одной серии временных сбоев — до отказа. */
const retryStreakMs = (tolerance: YandexSttTolerance): number => {
    let total = 0;
    for (let failure = 1; failure <= tolerance.transientRetries; failure++) {
        total += yandexBackoffMs(tolerance, failure);
    }
    return total;
};

/** Сколько длится опрос операции до таймаута «не завершил за отведённое время». */
export function yandexPollBudgetMs(tolerance: YandexSttTolerance): number {
    return (
        tolerance.pollMaxAttempts *
            (tolerance.pollDelayMs + POLL_REQUEST_ALLOWANCE_MS) +
        retryStreakMs(tolerance)
    );
}

/**
 * Полное ожидание Яндекса одним заданием: слот, отправка с повторами,
 * опрос и запас на запись и загрузку.
 */
export function yandexTranscribeBudgetMs(read: SettingReader): number {
    const tolerance = readYandexSttTolerance(read);
    return (
        readYandexSlotWaitMs(read) +
        retryStreakMs(tolerance) +
        yandexPollBudgetMs(tolerance) +
        TRANSCRIBE_MARGIN_MS
    );
}

/**
 * Таймаут задания TRANSCRIBE: env CALL_REPORT_JOB_TIMEOUT_MS, но не меньше
 * полного ожидания Яндекса — иначе Bull начнёт вторую попытку, пока первая
 * ещё ждёт результат.
 */
export function transcribeJobTimeoutMs(
    read: SettingReader,
    configuredMs: number,
): number {
    return Math.max(configuredMs, yandexTranscribeBudgetMs(read));
}
