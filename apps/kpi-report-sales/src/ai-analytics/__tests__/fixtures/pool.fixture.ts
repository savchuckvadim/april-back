/**
 * Фикстуры пула порталов (Фаза 4, П17/П22): нагрузки модели портала и
 * оценки связи качества в том виде, в каком их пишут шаги `portal-model`
 * и `quality-link`, и готовые входы пула `PoolPortalInput`.
 */
import { lagCdfFromTable, type PoolPortalInput } from '@lib/sales-ai-analytics';
import type { AiAnalyticsSnapshotRecord } from '../../store/ai-analytics-snapshot.types';

/** Нагрузка модели портала с полями, которые читает пул. */
export function poolModelPayload(
    patch: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        monthKey: '2026-08',
        // Окно модели — всегда 12 ключей месяцев; глубина истории — в готовности.
        window: Array.from(
            { length: 12 },
            (_, index) => `2025-${String(index + 1).padStart(2, '0')}`,
        ),
        readiness: { mode: 'norms', historyMonths: 9 },
        managers: 6,
        edgeKind: 'prob',
        edges: [
            { edge: 'call_to_presentation', mu: 0.05, n: 2000, kappa: 30 },
            { edge: 'presentation_to_offer', mu: 0.45, n: 300, kappa: 12 },
            { edge: 'offer_to_invoice', mu: 0.6, n: 120, kappa: 10 },
        ],
        lagCdf: {
            kind: 'kaplan-meier',
            medianDays: 10,
            n: 40,
            points: [
                { days: 0, value: 0 },
                { days: 10, value: 0.5 },
                { days: 30, value: 1 },
            ],
        },
        checkLognormal: { m: 11, v: 0.4, n: 40, w: 0.8, source: 'estimated' },
        season: {
            index: [1, 1, 1.1, 1, 0.9, 1, 1, 0.8, 1.1, 1, 1, 1.1],
            source: 'estimated',
        },
        ...patch,
    };
}

/** Нагрузка оценки связи качества: статус и pooled-оценка. */
export function qualityLinkPayload(
    status: string,
    pooled: { value: number; se: number } | null = { value: 0.3, se: 0.08 },
): Record<string, unknown> {
    return { status, pooled, sample: { n: 240 } };
}

/** Готовый вход пула: история 9 месяцев, два ребра, таблица лага. */
export function poolInput(
    portalKey: string,
    patch: Partial<PoolPortalInput> = {},
): PoolPortalInput {
    return {
        portalKey,
        consentAt: '2026-01-15',
        historyMonths: 9,
        managers: 6,
        edges: [
            { edge: 'e1', estimand: 'prob', mu: 0.05, kappa: 30, n: 2000 },
            { edge: 'e2', estimand: 'prob', mu: 0.45, kappa: 12, n: 300 },
        ],
        beta: { value: 0.3, se: 0.08, n: 240 },
        lagCdf: lagCdfFromTable(
            [
                { days: 0, value: 0 },
                { days: 10, value: 0.5 },
                { days: 30, value: 1 },
            ],
            { kind: 'kaplan-meier', n: 40 },
        ),
        lognormal: { m: 11, v: 0.4, n: 40 },
        seasonIndex: null,
        ...patch,
    };
}

/** Портальная запись стора за месяц (`as never` — лишние поля конверта не нужны). */
export const snapshotRecord = (
    periodKey: string,
    payload: unknown,
): AiAnalyticsSnapshotRecord =>
    ({ id: `r-${periodKey}`, periodKey, managerId: null, payload }) as never;
