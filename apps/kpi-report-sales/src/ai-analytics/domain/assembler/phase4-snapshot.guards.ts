/**
 * Структурные проверки нагрузок снапшотов Фазы 4 (контракт —
 * `contracts/snapshot.phase4.types.ts` библиотеки): связь качества,
 * пул порталов, точность прогноза и эффект советов.
 *
 * Чужая, старая или неполная форма отбрасывается (null), а не роняет
 * месячный шаг или витрину (§5.4). Значение шины может прийти как сама
 * нагрузка или как запись `{ payload }` — обе формы понимаются.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import {
    AI_FORECAST_BACKTEST_STATUSES,
    AI_POOL_STATUSES,
    AI_QUALITY_LINK_STATUSES,
    RECOMMENDATION_GATE_STATUSES,
    type ForecastBacktestSnapshot,
    type PoolSnapshot,
    type QualityLinkSnapshot,
    type RecommendationEffectSnapshot,
} from '@lib/sales-ai-analytics';

type Guard<T> = (value: unknown) => value is T;

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

const isNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const oneOf = (allowed: readonly string[], value: unknown): boolean =>
    typeof value === 'string' && allowed.includes(value);

/** Нагрузка связи качества с исходом за месяц. */
export const isQualityLinkSnapshot: Guard<QualityLinkSnapshot> = (
    value,
): value is QualityLinkSnapshot => {
    const record = asRecord(value);
    const gate = asRecord(record?.gate);
    const sample = asRecord(record?.sample);

    return (
        record !== null &&
        typeof record.monthKey === 'string' &&
        oneOf(AI_QUALITY_LINK_STATUSES, record.status) &&
        Array.isArray(record.curve) &&
        asRecord(record.reliability) !== null &&
        asRecord(record.calibration) !== null &&
        gate !== null &&
        typeof gate.published === 'boolean' &&
        isNumber(gate.streak) &&
        sample !== null &&
        isNumber(sample.n)
    );
};

/** Нагрузка пула порталов за месяц. */
export const isPoolSnapshot: Guard<PoolSnapshot> = (
    value,
): value is PoolSnapshot => {
    const record = asRecord(value);

    return (
        record !== null &&
        typeof record.monthKey === 'string' &&
        oneOf(AI_POOL_STATUSES, record.status) &&
        isNumber(record.eligible) &&
        Array.isArray(record.edges) &&
        Array.isArray(record.portals) &&
        asRecord(record.evidence) !== null
    );
};

/** Нагрузка проверки точности прогноза отдела. */
export const isForecastBacktestSnapshot: Guard<ForecastBacktestSnapshot> = (
    value,
): value is ForecastBacktestSnapshot => {
    const record = asRecord(value);

    return (
        record !== null &&
        typeof record.monthKey === 'string' &&
        oneOf(AI_FORECAST_BACKTEST_STATUSES, record.status) &&
        Array.isArray(record.reasons) &&
        isNumber(record.shadowMonths) &&
        isNumber(record.shadowMinMonths)
    );
};

/** Нагрузка оценки эффекта советов. */
export const isRecommendationEffectSnapshot: Guard<
    RecommendationEffectSnapshot
> = (value): value is RecommendationEffectSnapshot => {
    const record = asRecord(value);
    const gate = asRecord(record?.gate);

    return (
        record !== null &&
        typeof record.monthKey === 'string' &&
        isNumber(record.issued) &&
        isNumber(record.done) &&
        asRecord(record.doneShare) !== null &&
        asRecord(record.params) !== null &&
        Array.isArray(record.beforeAfter) &&
        gate !== null &&
        oneOf(RECOMMENDATION_GATE_STATUSES, gate.status) &&
        Array.isArray(gate.reasons)
    );
};

/**
 * Нагрузка по проверке: сама форма или поле `payload` записи шины;
 * иначе null.
 */
export function phase4PayloadOf<T>(value: unknown, guard: Guard<T>): T | null {
    if (guard(value)) return value;
    const payload = asRecord(value)?.payload;

    return guard(payload) ? payload : null;
}
