/**
 * Итоги периода по менеджерам (этап 7.4): контракт ручного запуска, общий
 * для админки (ставит джобу и читает итог) и event-sales (крон, воркер,
 * расчёт карточек). Чистые типы и функции без DI.
 *
 * Состояние прогонов — в Redis по ключам каркаса `@lib/rop-reports`
 * (`ropKeys(PERIOD_DIGEST_KEY_PREFIX)`), карточки — снимками в ais
 * (`DIGEST_SNAPSHOT_TYPE`).
 */
import type { DigestPeriodKind } from '../model/period-digest/period-digest.types';

/** Префикс ключей Redis отчёта: замки, метки выпуска, итог прогона. */
export const PERIOD_DIGEST_KEY_PREFIX = 'event-sales:period-digest';

/** Кто поставил прогон. */
export const PERIOD_DIGEST_REQUESTERS = {
    admin: 'admin',
} as const;

/** Данные джобы ручного прогона (очередь EVENT_SALES_PERIOD_DIGEST_RUN). */
export interface PeriodDigestJobData {
    readonly domain: string;
    readonly kind: DigestPeriodKind;
    /** Ключ периода ('2026-W46', '2026-10'); нет — последний закрытый. */
    readonly periodKey?: string;
    readonly requestedBy: string;
}

/** Одна джоба на портал и вид периода: второе нажатие не ставит вторую. */
export const periodDigestJobId = (
    domain: string,
    kind: DigestPeriodKind,
): string => `${domain}:period-digest:${kind}`;

/**
 * Опции джобы: идёт другой прогон портала (замок общий с кроном) — повтор
 * раз в минуту в течение 15 минут. Таймаута нет: повтор по таймауту
 * запустил бы второй расчёт поверх идущего.
 */
export const PERIOD_DIGEST_JOB_OPTIONS = {
    attempts: 15,
    backoff: { type: 'fixed', delay: 60_000 },
    removeOnComplete: true,
    removeOnFail: true,
} as const;
