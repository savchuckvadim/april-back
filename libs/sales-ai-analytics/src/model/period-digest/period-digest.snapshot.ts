import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    type AiAnalyticsSnapshotType,
} from '../../contracts/snapshot-kinds.const';
import { DIGEST_PERIOD_KIND } from './period-digest.codes';
import type {
    DigestPeriodKind,
    ManagerDigestCard,
} from './period-digest.types';

/**
 * Карточка периода в ais: тип записи по виду периода, ключ (activity_id) —
 * ключ периода ('2026-W46', '2026-10'), user_id — менеджер, нагрузка —
 * `ManagerDigestCard` в конверте снапшотов AI-аналитики. Здесь — тип и
 * проверка нагрузки; запись и чтение — стор в event-sales.
 */

export const DIGEST_SNAPSHOT_TYPE = {
    [DIGEST_PERIOD_KIND.week]: AI_ANALYTICS_SNAPSHOT_TYPE.managerWeekDigest,
    [DIGEST_PERIOD_KIND.month]: AI_ANALYTICS_SNAPSHOT_TYPE.managerMonthDigest,
} as const satisfies Record<DigestPeriodKind, AiAnalyticsSnapshotType>;

/** Версия расчёта карточки: колонка model записи ais. */
export const DIGEST_CALC_VERSION = 'period-digest-1.0.0';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const DIGEST_KINDS: readonly unknown[] = Object.values(DIGEST_PERIOD_KIND);

/**
 * Нагрузка записи — карточка периода: версия схемы, период, менеджер,
 * метрики, рекомендации и блок «Для РОПа». Чужая или битая форма — false:
 * прошлая карточка тогда просто не читается (рекомендации начнутся заново).
 */
export function isManagerDigestCard(
    value: unknown,
): value is ManagerDigestCard {
    if (!isRecord(value) || value.schemaVersion !== 1) return false;
    const { period, managerId, metrics, recommendations, forRop } = value;
    return (
        isRecord(period) &&
        DIGEST_KINDS.includes(period.kind) &&
        typeof period.key === 'string' &&
        typeof managerId === 'string' &&
        isRecord(metrics) &&
        Array.isArray(recommendations) &&
        isRecord(forRop)
    );
}
