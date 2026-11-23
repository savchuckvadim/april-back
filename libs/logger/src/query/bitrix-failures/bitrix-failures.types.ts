/**
 * Журнал сбоев Битрикса — срез `app_logs` по строкам с `meta.bitrixFailure`.
 *
 * Пишет их libs/bitrix (core/failure, BitrixFailureLogMeta) ТОЛЬКО на
 * окончательных исходах: попытки исчерпаны, ошибка не лечится повтором,
 * чанк пачки не выполнен, команда внутри пачки упала. Имена полей meta —
 * общий контракт с писателем.
 */

/** Что не выполнилось: одиночный вызов, пачка целиком, команда пачки. */
export const BITRIX_FAILURE_KINDS = ['call', 'batch', 'command'] as const;
export type BitrixFailureKindView = (typeof BITRIX_FAILURE_KINDS)[number];

/** Фильтр журнала сбоев. Пустые поля — без условия. */
export interface BitrixFailureFilter {
    hours: number;
    app?: string;
    /** Портал: `domain` на верхнем уровне meta (общий фильтр журналов). */
    domain?: string;
    /** Только сбои записи — к строкам; сводка считает и запись, и чтение. */
    writeOnly?: boolean;
}

/** Строка журнала сбоев для админки. Время — ISO UTC. */
export interface BitrixFailureRowView {
    at: string;
    app: string;
    domain: string;
    kind: BitrixFailureKindView;
    /** REST-метод; у пачки целиком — `batch`. */
    method: string;
    /** Пропала запись (у пачки — была ли в ней запись). */
    write: boolean;
    /** «сделка ×3, задача ×1»; '' — не пачка. */
    commands: string;
    /** Команд в пачке; 0 — не пачка. */
    commandsTotal: number;
    /** Сущность запроса: «сделка 26735»; '' — не известна. */
    target: string;
    /** HTTP-статус ответа Битрикса; null — ответа не было (таймаут). */
    status: number | null;
    error: string;
    /** Операция по-русски; '' — точка входа не подписана. */
    operation: string;
    /** Маршрут, крон или очередь. */
    source: string;
    /** Карточка, ради которой шла работа: тип (deal, company…) и id. */
    entityType: string;
    entityId: string;
    /** Сотрудник; null — не известен. */
    actorId: number | null;
    actorName: string;
}

/** Сколько сбоев записи и чтения в группе (приложение или операция). */
export interface BitrixFailureGroupStat {
    /** Имя группы; '' — не известно (приложение или операция не подписаны). */
    name: string;
    writes: number;
    reads: number;
    total: number;
}

export interface BitrixFailureSummary {
    hours: number;
    from: string;
    to: string;
    total: number;
    writes: number;
    reads: number;
    apps: BitrixFailureGroupStat[];
    operations: BitrixFailureGroupStat[];
}

export interface BitrixFailuresView {
    summary: BitrixFailureSummary;
    rows: BitrixFailureRowView[];
}

/** Сырой счёт по паре «приложение × операция» из ClickHouse. */
export interface BitrixFailureCountRow {
    app: string;
    operation: string;
    writes: number;
    reads: number;
}
