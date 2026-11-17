/**
 * Движение сделок (этап 7.3): контракт прогона, общий для админки (ставит
 * джобу и читает состояние) и event-sales (крон, воркер, Битрикс). Чистые
 * типы и функции без DI.
 *
 * Хранение (решение 17.11.2026): состояние по сделкам и ход прогона — в
 * Redis (ключи ниже), в ais — только маленький дневной снимок
 * (`deal-movement-snapshot.types.ts`).
 */
import {
    DEAL_MOVEMENT_STATUSES,
    type DealMovementStatus,
} from '../model/deal-movement/deal-movement.types';

/**
 * Режим прогона: `dry-run` — «Посчитать», ничего не сохраняется, итог
 * только в состоянии прогона; `count` — ночной счёт: состояние и дневной
 * снимок сохраняются, `notifiedStatus` сдвигается молча. Запись в ленту
 * сделок появится следующим режимом.
 */
export const DEAL_MOVEMENT_RUN_MODES = ['dry-run', 'count'] as const;
export type DealMovementRunMode = (typeof DEAL_MOVEMENT_RUN_MODES)[number];

/** Режим словами — для Telegram и админки. */
export const DEAL_MOVEMENT_RUN_MODE_TITLES: Readonly<
    Record<DealMovementRunMode, string>
> = {
    'dry-run': 'подсчёт без сохранения',
    count: 'ночной счёт без записи в сделки',
};

/** Фаза прогона — для «идёт сейчас» в админке. */
export const DEAL_MOVEMENT_RUN_PHASES = [
    'started',
    'deals',
    'history',
    'calls',
    'evaluated',
    'saved',
    'done',
    'failed',
] as const;
export type DealMovementRunPhase = (typeof DEAL_MOVEMENT_RUN_PHASES)[number];

/** Кто поставил прогон: ночной крон или админка. */
export const DEAL_MOVEMENT_REQUESTERS = {
    nightly: 'nightly',
    admin: 'admin',
} as const;

/** Данные джобы ручного прогона (очередь EVENT_SALES_DEAL_MOVEMENT_RUN). */
export interface DealMovementJobData {
    domain: string;
    /** true — «Посчитать» (ничего не сохраняется). */
    dryRun: boolean;
    requestedBy: string;
}

/** Один джоб на портал и режим: пока он ждёт или идёт, второй не ставится. */
export const dealMovementJobId = (domain: string, dryRun: boolean): string =>
    `${domain}:deal-movement:${dryRun ? 'dry-run' : 'run'}`;

/**
 * Опции джобы: идёт другой прогон портала (замок общий с кроном) — повтор
 * раз в минуту в течение 15 минут. Таймаута нет: повтор по таймауту
 * запустил бы второй счёт поверх идущего.
 */
export const DEAL_MOVEMENT_JOB_OPTIONS = {
    attempts: 15,
    backoff: { type: 'fixed', delay: 60_000 },
    removeOnComplete: true,
    removeOnFail: true,
} as const;

/** Версия расчёта: колонка model дневного снимка. */
export const DEAL_MOVEMENT_CALC_VERSION = 'deal-movement-1.0.0';

/** Ход и итог прогона портала (Redis, ключ `status`). */
export interface DealMovementRunStatus {
    domain: string;
    mode: DealMovementRunMode;
    requestedBy: string;
    phase: DealMovementRunPhase;
    startedAt: string;
    updatedAt: string;
    finished: boolean;
    /** Открытых сделок «ОП Основная» на портале. */
    openTotal: number;
    /** Сколько из них оценено (потолок ночи). */
    evaluated: number;
    /** Сработал потолок сделок за ночь. */
    capped: boolean;
    /** Прошлого состояния нет или оно устарело — базовая линия заново. */
    baseline: boolean;
    /** Сделок, увиденных впервые. */
    firstSeen: number;
    byStatus: Record<DealMovementStatus, number>;
    /** Сколько сделок сменили статус за ночь. */
    changed: number;
    /** День дневного снимка 'YYYY-MM-DD'; null — снимок не писался. */
    snapshotDay: string | null;
    warnings: string[];
    error: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isCounts = (value: unknown): boolean =>
    isRecord(value) &&
    DEAL_MOVEMENT_STATUSES.every(status => typeof value[status] === 'number');

/** Структурная проверка состояния прогона при чтении из Redis. */
export function isDealMovementRunStatusLike(
    value: unknown,
): value is DealMovementRunStatus {
    if (!isRecord(value)) return false;
    return (
        typeof value.domain === 'string' &&
        (DEAL_MOVEMENT_RUN_MODES as readonly unknown[]).includes(value.mode) &&
        (DEAL_MOVEMENT_RUN_PHASES as readonly unknown[]).includes(
            value.phase,
        ) &&
        typeof value.startedAt === 'string' &&
        typeof value.updatedAt === 'string' &&
        typeof value.finished === 'boolean' &&
        typeof value.openTotal === 'number' &&
        typeof value.evaluated === 'number' &&
        isCounts(value.byStatus) &&
        Array.isArray(value.warnings)
    );
}

/** Ключи Redis движения сделок — один источник для event-sales и админки. */
export const DEAL_MOVEMENT_REDIS_KEYS = {
    /** Замок тика крона (один процесс на кластер). */
    tickLock: 'event-sales:deal-movement:tick-lock',
    /** Замок портала — общий у крона и ручного прогона. */
    lock: (domain: string): string =>
        `event-sales:deal-movement:lock:${domain}`,
    /** Ход и итог последнего прогона портала. */
    status: (domain: string): string =>
        `event-sales:deal-movement:status:${domain}`,
    /** Хеш состояния по сделкам: поле — id сделки. */
    state: (domain: string): string =>
        `event-sales:deal-movement:state:${domain}`,
    /** Черновик хеша: пишется целиком и подменяет состояние одной командой. */
    stateDraft: (domain: string): string =>
        `event-sales:deal-movement:state-draft:${domain}`,
    /** Последний сохранённый счёт: день портала и момент. */
    lastRun: (domain: string): string =>
        `event-sales:deal-movement:last-run:${domain}`,
} as const;
