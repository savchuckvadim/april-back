/**
 * Отказы стража отправок в Яндекс (19.11.2026). Все — постоянные с точки
 * зрения роутера (не isTransientYandexError): платный звонок не уходит на
 * запасной распознаватель и не повторяется сам.
 */

/** Этот звонок уже распознаётся (замок взят другим заданием или процессом). */
export class YandexCallBusyError extends Error {
    readonly name = 'YandexCallBusyError';

    constructor(label: string) {
        super(
            `Распознавание этого звонка в Яндексе уже идёт (${label}) — повторно не отправлен`,
        );
    }
}

/** Звонок исчерпал лимит отправок в Яндекс за окно — нужна проверка человеком. */
export class YandexSubmitLimitError extends Error {
    readonly name = 'YandexSubmitLimitError';

    constructor(label: string, limit: number, windowHours: number) {
        super(
            `Звонок ${label} отправлялся в Яндекс ${limit} раза за ${windowHours} ч — ` +
                'новые отправки остановлены, нужна проверка',
        );
    }
}

/** Слот Яндекса в процессе не освободился за отведённое время. */
export class YandexSlotTimeoutError extends Error {
    readonly name = 'YandexSlotTimeoutError';

    constructor(label: string, waitMs: number) {
        super(
            `Слот Яндекса не освободился за ${Math.round(waitMs / 60_000)} мин — ` +
                `звонок ${label} в Яндекс не отправлен`,
        );
    }
}
