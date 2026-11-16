/** Адрес ручки списка звонков клиента внутри `event-sales-bx-records`. */
export const CLIENT_CALLS_ROUTE = 'calls' as const;

/** Сколько последних звонков клиента отдаём за раз. */
export const CLIENT_CALLS_LIMIT = 50;

/**
 * Сколько ждём разбор после расшифровки. Дольше — считаем, что разбор для
 * звонка не делался (короткий для своего типа, нерабочий), а не идёт.
 */
export const CLIENT_CALL_ANALYSIS_GRACE_MS = 2 * 60 * 60_000;

/**
 * Состояние разбора звонка:
 * analyzed — разбор готов; processing — в очереди или в работе;
 * failed — расшифровка упала; skipped — расшифрован, разбора нет;
 * none — конвейер до звонка не дошёл.
 */
export const CLIENT_CALL_STATES = [
    'analyzed',
    'processing',
    'failed',
    'skipped',
    'none',
] as const;

export type ClientCallState = (typeof CLIENT_CALL_STATES)[number];

/** Подписи состояний для менеджера. */
export const CLIENT_CALL_STATE_TITLES: Record<ClientCallState, string> = {
    analyzed: 'Разобран',
    processing: 'Разбирается',
    failed: 'Разобрать не удалось',
    skipped: 'Расшифрован, разбор не делался',
    none: 'Ещё не разбирался',
};

/** Направление звонка. */
export const CLIENT_CALL_DIRECTIONS = ['incoming', 'outgoing'] as const;

export type ClientCallDirection = (typeof CLIENT_CALL_DIRECTIONS)[number];

/** К чему в CRM привязано дело звонка. */
export const CLIENT_CALL_OWNER_TYPES = [
    'deal',
    'lead',
    'company',
    'contact',
] as const;

export type ClientCallOwnerType = (typeof CLIENT_CALL_OWNER_TYPES)[number];
