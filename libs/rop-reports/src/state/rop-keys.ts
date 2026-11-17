import { ROP_PERIOD_KIND, RopPeriodKind } from '../period/rop-period';

/**
 * КЛЮЧИ REDIS отчёта РОПу — одна фабрика на отчёт по его префиксу
 * («event-sales:period-digest»). Отчёт, переезжающий на каркас со своими
 * старыми ключами (дубли), реализует `RopReportKeys` сам — метки выпуска
 * и память задач тогда не теряются.
 *
 * Вид периода входит во все ключи, где он нужен для идемпотентности:
 * неделя и месяц выпускаются независимо, и задача-итог недели не
 * закрывает задачу-итог месяца.
 */

/** Область счётчика неудач: вид периода либо подготовка прогона портала. */
export const ROP_SETUP_SCOPE = 'setup' as const;

export type RopFailureScope = RopPeriodKind | typeof ROP_SETUP_SCOPE;

export interface RopReportKeys {
    /** Замок портала: крон и ручной запуск одного портала не накладываются. */
    lock(domain: string): string;
    /** Замок тика: два тика отчёта не идут одновременно. */
    tickLock(): string;
    /** Метка выпуска (значение — ключ периода); у «только считать» своя. */
    released(domain: string, kind: RopPeriodKind, countOnly: boolean): string;
    /** Неудачные попытки: «ключ периода:номер попытки». */
    failures(domain: string, scope: RopFailureScope): string;
    /** Последняя задача-отчёт получателя: ключ периода и id задачи. */
    task(domain: string, kind: RopPeriodKind, userId: number): string;
    /** Кому уходили задачи-отчёты этого вида. */
    recipients(domain: string, kind: RopPeriodKind): string;
    /** Итог последнего прогона — для состояния в админке. */
    lastRun(domain: string, kind: RopPeriodKind): string;
}

/** Ключи отчёта по префиксу; пустой префикс — ошибка, а не общие ключи. */
export function ropKeys(prefix: string): RopReportKeys {
    const base = prefix.trim();
    if (!base || /\s/.test(base)) {
        throw new RangeError(
            `Префикс ключей отчёта должен быть непустым и без пробелов: «${prefix}»`,
        );
    }
    return {
        lock: domain => `${base}:lock:${domain}`,
        tickLock: () => `${base}:tick-lock`,
        released: (domain, kind, countOnly) =>
            `${base}:released${countOnly ? '-count' : ''}:${kind}:${domain}`,
        failures: (domain, scope) => `${base}:failed:${scope}:${domain}`,
        task: (domain, kind, userId) =>
            `${base}:task:${kind}:${domain}:${userId}`,
        recipients: (domain, kind) => `${base}:recipients:${kind}:${domain}`,
        lastRun: (domain, kind) => `${base}:last-run:${kind}:${domain}`,
    };
}

const DAY_SEC = 24 * 60 * 60;

/** Замок портала и тика: прогон портала плюс задачи всем получателям. */
export const ROP_LOCK_TTL_SEC = 30 * 60;

/**
 * Метки выпуска, неудач и итога прогона: живут дольше периода и его
 * догона, чтобы сдвиг дня выпуска не выпустил период второй раз.
 */
export const ROP_MARK_TTL_SEC: Readonly<Record<RopPeriodKind, number>> = {
    [ROP_PERIOD_KIND.week]: 15 * DAY_SEC,
    [ROP_PERIOD_KIND.month]: 70 * DAY_SEC,
    [ROP_PERIOD_KIND.quarter]: 200 * DAY_SEC,
    [ROP_PERIOD_KIND.halfYear]: 380 * DAY_SEC,
    [ROP_PERIOD_KIND.year]: 740 * DAY_SEC,
};

/** Неудачи подготовки портала считаются по суткам. */
export const ROP_SETUP_FAILURE_TTL_SEC = 2 * DAY_SEC;

/**
 * Память задач получателя: дольше периода, чтобы следующий выпуск нашёл
 * и закрыл прошлую задачу; старше — уже не «прошлый отчёт».
 */
export const ROP_TASK_TTL_SEC: Readonly<Record<RopPeriodKind, number>> = {
    [ROP_PERIOD_KIND.week]: 90 * DAY_SEC,
    [ROP_PERIOD_KIND.month]: 120 * DAY_SEC,
    [ROP_PERIOD_KIND.quarter]: 400 * DAY_SEC,
    [ROP_PERIOD_KIND.halfYear]: 400 * DAY_SEC,
    [ROP_PERIOD_KIND.year]: 800 * DAY_SEC,
};
