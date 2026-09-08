/**
 * Плацебо-тест меток времени (план `ai-sales-analytics`, §4.4 «Плацебо», п. 2).
 *
 * Если дата закрытия сделки стоит **раньше** последней презентации или счёта
 * того же эпизода, то «активность → продажа» в такой сделке идёт против
 * времени: продажа была оформлена задним числом либо метки проставлены
 * вручную. Такие сделки нельзя использовать как подтверждение связи качества
 * с исходом, поэтому конвейер считает их долю и сравнивает с
 * `dq.timestamp_leak_max = 5 %`.
 *
 * Чистый слой: на вход приходят уже нормализованные факты (моменты ISO 8601),
 * форм данных Битрикс здесь нет; `new Date()` и `Date.now()` запрещены —
 * сравниваются только переданные метки.
 */
import { MS_PER_DAY, parseInstant } from './episode';

/** Порог доли протечки меток времени по умолчанию (`dq.timestamp_leak_max`). */
export const TIMESTAMP_LEAK_MAX = 0.05;

/** Процентных пунктов в единице доли. */
const PCT_IN_UNIT = 100;

/** Точность доли в процентах: 6 знаков. */
const PCT_PRECISION = 1e6;

/** Какая метка оказалась позже даты закрытия. */
export const AI_TIMESTAMP_LEAK_SOURCES = ['presentation', 'invoice'] as const;

export type AiTimestampLeakSource = (typeof AI_TIMESTAMP_LEAK_SOURCES)[number];

/** Факт продажи с метками времени эпизода. */
export interface SaleTimestampFact {
    /** Ключ эпизода `entityId#index` — им продажа находится в разборе. */
    readonly episodeKey: string;
    /** Дата закрытия сделки (`CLOSEDATE` либо переход в `sales_success`). */
    readonly closedAt: string;
    /** Последняя презентация эпизода; null — презентаций не было. */
    readonly lastPresentationAt: string | null;
    /** Последний счёт эпизода; null — счетов не было. */
    readonly lastInvoiceAt: string | null;
}

/** Одна продажа с меткой закрытия раньше активности. */
export interface TimestampLeak {
    readonly episodeKey: string;
    readonly source: AiTimestampLeakSource;
    /** На сколько дней закрытие раньше активности (положительное число). */
    readonly aheadDays: number;
}

export interface TimestampLeakResult {
    /** Продаж в выборке. */
    readonly n: number;
    /** Из них с закрытием раньше активности. */
    readonly leaked: number;
    /** Доля протечки в процентах: 1 из 10 → 10. */
    readonly sharePct: number;
    /** Порог в доле (0,05 = 5 %), с которым сравнивалась доля. */
    readonly maxPct: number;
    /** Доля выше порога — конвейер поднимает флаг качества данных. */
    readonly flagged: boolean;
    /** Ключи протёкших эпизодов — для разбора спорных сделок. */
    readonly leaks: readonly TimestampLeak[];
}

const round = (value: number): number =>
    Math.round(value * PCT_PRECISION) / PCT_PRECISION;

/** Метка активности позже закрытия? Возвращает опережение в днях. */
function aheadDays(closedMs: number, activityIso: string | null): number {
    const activity = activityIso === null ? null : parseInstant(activityIso);
    if (activity === null || activity <= closedMs) {
        return 0;
    }

    return round((activity - closedMs) / MS_PER_DAY);
}

/**
 * Протечка одной продажи: берётся более поздняя из меток, потому что
 * достаточно одной активности после закрытия, чтобы факт был испорчен.
 */
export function saleTimestampLeak(
    sale: SaleTimestampFact,
): TimestampLeak | null {
    const closed = parseInstant(sale.closedAt);
    if (closed === null) {
        return null;
    }
    const presentation = aheadDays(closed, sale.lastPresentationAt);
    const invoice = aheadDays(closed, sale.lastInvoiceAt);
    if (presentation <= 0 && invoice <= 0) {
        return null;
    }

    return {
        episodeKey: sale.episodeKey,
        source: invoice > presentation ? 'invoice' : 'presentation',
        aheadDays: Math.max(presentation, invoice),
    };
}

/**
 * Доля продаж с датой закрытия раньше последней презентации или счёта
 * эпизода (план §4.4). `maxPct` — порог в **доле** (0,05 = 5 %), результат
 * `sharePct` — в процентах: 1 продажа из 10 даёт `sharePct = 10` и `flagged`.
 * Пустая выборка → 0 % и без флага: нечего проверять, а не «всё хорошо».
 */
export function timestampLeakShare(
    sales: readonly SaleTimestampFact[],
    maxPct: number = TIMESTAMP_LEAK_MAX,
): TimestampLeakResult {
    const leaks = sales
        .map(saleTimestampLeak)
        .filter((leak): leak is TimestampLeak => leak !== null);
    const n = sales.length;
    const sharePct = n === 0 ? 0 : round((leaks.length / n) * PCT_IN_UNIT);
    const threshold = Number.isFinite(maxPct) ? maxPct : TIMESTAMP_LEAK_MAX;

    return {
        n,
        leaked: leaks.length,
        sharePct,
        maxPct: threshold,
        flagged: n > 0 && sharePct / PCT_IN_UNIT > threshold,
        leaks,
    };
}
