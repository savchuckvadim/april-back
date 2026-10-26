/** Уровни журнала, как их пишет winston в колонку `level`. */
export const LOG_QUERY_LEVELS = [
    'error',
    'warn',
    'info',
    'debug',
    'verbose',
] as const;
export type LogQueryLevel = (typeof LOG_QUERY_LEVELS)[number];

/** Окно журналов в часах: таблица хранит 30 дней. */
export const LOG_QUERY_HOURS = { min: 1, max: 24 * 30, fallback: 24 } as const;
export const LOG_QUERY_ROWS = { max: 500, fallback: 100 } as const;

/** Фильтр чтения журналов. Пустые поля — без условия. */
export interface LogQueryFilter {
    hours: number;
    app?: string;
    env?: string;
    level?: LogQueryLevel;
    /** Портал: `domain` в meta или адрес портала в тексте сообщения. */
    domain?: string;
    /** Подстрока текста сообщения без учёта регистра. */
    search?: string;
}

/** Строка журнала для просмотра. Время — ISO UTC. */
export interface LogRowView {
    at: string;
    app: string;
    env: string;
    level: string;
    context: string;
    message: string;
    meta: string;
    trace: string;
    /** Портал строки; '' — не определён. */
    domain: string;
}

/** Приложение за окно и предыдущее такое же окно — для всплесков и тишины. */
export interface LogAppStat {
    app: string;
    errors: number;
    warnings: number;
    total: number;
    prevErrors: number;
    prevTotal: number;
    /** Последняя запись приложения за двойное окно; null — нет. */
    lastAt: string | null;
}

/** Повторяющаяся ошибка: текст без чисел, сколько раз, где. */
export interface LogErrorPattern {
    app: string;
    /** Текст первого вхождения (полный, без замены чисел). */
    sample: string;
    count: number;
    firstAt: string;
    lastAt: string;
    domains: string[];
}

export interface LogDomainStat {
    domain: string;
    errors: number;
    warnings: number;
    total: number;
}

export interface LogSummary {
    hours: number;
    /** Начало и конец окна, ISO UTC. */
    from: string;
    to: string;
    apps: LogAppStat[];
    topErrors: LogErrorPattern[];
    domains: LogDomainStat[];
    /** Выводы словами: всплески, частые ошибки, проблемные порталы, тишина. */
    conclusions: string[];
}
