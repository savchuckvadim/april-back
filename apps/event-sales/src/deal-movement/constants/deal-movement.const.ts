/**
 * Движение сделок (этап 7.3): расписание, сроки хранения и размеры порций.
 * Ключи Redis — в контракте библиотеки (`DEAL_MOVEMENT_REDIS_KEYS`), их
 * читает и админка.
 */

/**
 * Тик крона: каждый час в :27. Минута свободна: получасовые кроны
 * event-sales стоят на 03/07/13/17/23 и +30, догон разборов — :41,
 * распознавание — :19, часовые — :00 (ai/rules: разнесённые кроны).
 */
export const DEAL_MOVEMENT_CRON = '0 27 * * * *';
export const DEAL_MOVEMENT_CRON_NAME = 'event-sales-deal-movement';

/**
 * Ночное окно по часам портала: с 02:00 до 05:00. После ночного догона
 * признаков разборов (01:30 МСК) и до ночного конвейера витрины (03:45);
 * если ночь сорвалась на первом тике — следующие тики окна её догонят.
 */
export const DEAL_MOVEMENT_NIGHT = { fromHour: 2, toHour: 5 } as const;

const DAY_SEC = 24 * 60 * 60;

/** Сроки жизни ключей Redis. */
export const DEAL_MOVEMENT_TTL_SEC = {
    /** Состояние по сделкам: 7 суток, продлевается каждым счётом. */
    state: 7 * DAY_SEC,
    /** Метка последнего счёта — столько же, сколько состояние. */
    lastRun: 7 * DAY_SEC,
    /** Ход и итог последнего прогона — две недели для разбора. */
    status: 14 * DAY_SEC,
    /** Замок портала: продлевается между фазами прогона. */
    lock: 30 * 60,
    /** Замок тика: меньше часа, чтобы следующий тик не встал. */
    tickLock: 55 * 60,
} as const;

/**
 * Состояние старше стольких суток — базовая линия заново: после простоя
 * нельзя выдать накопленные смены статуса разом (решение 17.11.2026).
 */
export const DEAL_MOVEMENT_STALE_STATE_DAYS = 3;

/** Не чаще одной записи по сделке за столько суток (для режима записи). */
export const DEAL_MOVEMENT_MIN_DAYS_BETWEEN_NOTES = 3;

/** Сделок в одной команде истории стадий и предел раундов курсора. */
export const DEAL_MOVEMENT_HISTORY = {
    dealsPerCommand: 50,
    maxRounds: 40,
} as const;

/** Расшифровок в одном запросе разборов к БД (решение 17.11.2026). */
export const DEAL_MOVEMENT_CALLS_CHUNK = 100;

/** Полей Битрикса в выборке сделок — только нужные правилам и итогу. */
export const DEAL_MOVEMENT_DEAL_SELECT = [
    'ID',
    'TITLE',
    'STAGE_ID',
    'ASSIGNED_BY_ID',
    'OPPORTUNITY',
    'MOVED_TIME',
    'LAST_ACTIVITY_TIME',
    'COMPANY_ID',
    'CONTACT_ID',
    'LEAD_ID',
    'DATE_CREATE',
] as const;

/** Значения настроек по умолчанию (дублируют реестр на случай мусора). */
export const DEAL_MOVEMENT_SETTING_DEFAULTS = {
    windowDays: 14,
    stuckDays: 21,
    agreedStillDays: 12,
    callsLookbackDays: 60,
    maxDeals: 10_000,
} as const;
