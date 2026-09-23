/**
 * Типы трендов рядов менеджера (план Фазы 3, поток П1 `p3-trends`): точка
 * ряда «неделя/месяц менеджера», нормализованный ряд после разрывов
 * (`comparableFrom`, смена версий разбора), три вида сигнала — сдвиг
 * уровня (CUSUM на остатках), дрейф (двойная EWMA) и выброс (XmR-карта) —
 * и итог обнаружения с доверием по числу сравнимых точек.
 *
 * Чистые типы: без DI, Bitrix и Prisma.
 */
import type { ConfidenceLevel } from '../metric';

/** Виды сигнала в порядке старшинства: сдвиг > дрейф > выброс. */
export const TREND_SIGNAL_KINDS = ['shift', 'drift', 'outlier'] as const;
export type TrendSignalKind = (typeof TREND_SIGNAL_KINDS)[number];

/** Направление сигнала относительно уровня ряда. */
export const TREND_DIRECTIONS = ['up', 'down'] as const;
export type TrendDirection = (typeof TREND_DIRECTIONS)[number];

/** Причины доверия `none` / `low` к трендам ряда. */
export const TREND_CONFIDENCE_REASONS = {
    /** Сравнимых точек меньше минимума метода. */
    fewPoints: 'few-points',
    /** Ряд разорван (`comparableFrom` или смена версий) — до разрыва не считаем. */
    seriesBreak: 'series-break',
    /** Разборов в окне меньше `trend_window_calls`. */
    fewCalls: 'few-calls',
    /** Разброса в ряду нет (σ = 0) — статистики не определены. */
    noVariance: 'no-variance',
} as const;
export type TrendConfidenceReason =
    (typeof TREND_CONFIDENCE_REASONS)[keyof typeof TREND_CONFIDENCE_REASONS];

/**
 * Сырая точка ряда: ключ периода (сортируемая строка 'YYYY-Www' либо
 * 'YYYY-MM'), значение (null — «мало данных», точка выпадает из ряда),
 * объём и сигнатура версий разбора (null — неизвестна, ряд не рвёт).
 */
export interface TrendPoint {
    key: string;
    value: number | null;
    n: number;
    signature?: string | null;
}

/** Точка нормализованного ряда: значение всегда есть. */
export interface TrendSeriesPoint {
    key: string;
    value: number;
    n: number;
}

/** Сколько точек отброшено нормализацией и почему. */
export interface TrendSeriesCut {
    /** Ключ раньше границы сравнимой истории. */
    beforeComparable: number;
    /** Точки до последней смены сигнатуры версий разбора. */
    versionBreak: number;
    /** Значение null — «мало данных» в периоде. */
    noValue: number;
}

/** Нормализованный ряд: точки по возрастанию ключа и след отбрасываний. */
export interface TrendSeries {
    points: TrendSeriesPoint[];
    cut: TrendSeriesCut;
    /** Ключ периода, с которого ряд сравним; null — ряд не рвался. */
    comparableFromKey: string | null;
}

/** Сигнал по ряду: вид, направление, с какой точки, величина и статистика. */
export interface TrendSignal {
    kind: TrendSignalKind;
    direction: TrendDirection;
    /** Ключ точки, с которой начался сдвиг / дрейф (у выброса — последняя). */
    sinceKey: string;
    /** Индекс той же точки в нормализованном ряду. */
    sinceIndex: number;
    /**
     * Величина в единицах метрики: сдвиг — средний уровень после точки
     * начала минус базовая линия; дрейф — короткая EWMA минус длинная;
     * выброс — последняя точка минус центр карты.
     */
    magnitude: number;
    /** Статистика на последней точке в единицах σ_personal. */
    statistic: number;
    /** Порог, который статистика превысила (те же единицы). */
    threshold: number;
}

/** Пороги сигналов: h CUSUM и k дрейфа после калибровки, σ XmR из реестра. */
export interface TrendThresholds {
    cusumH: number;
    driftK: number;
    xmrSigma: number;
}

/** Параметры обнаружения сигналов одного ряда. */
export interface TrendDetectOptions {
    /** α короткой EWMA (`trend_ewma_short`). */
    alphaShort: number;
    /** α длинной EWMA (`trend_ewma_long`). */
    alphaLong: number;
    /** Опорное смещение k табличного CUSUM, единицы σ. */
    cusumK: number;
    /** Точек базовой линии для μ0 CUSUM. */
    baselinePoints: number;
    /** Окон подряд над порогом для флага дрейфа. */
    consecutive: number;
    /** Минимум точек ряда; ниже — доверие none и сигналов нет. */
    minPoints: number;
    /** От скольких точек доверие ok (ниже — low). */
    okPoints: number;
    thresholds: TrendThresholds;
}

/** Итог обнаружения по одному ряду. */
export interface TrendDetection {
    confidence: ConfidenceLevel;
    reason: TrendConfidenceReason | null;
    /** Сравнимых точек в ряду. */
    points: number;
    /** σ_personal ряда (MR̄ / d₂); null — точек мало или разброса нет. */
    sigma: number | null;
    /** Сигналы в порядке старшинства (сдвиг, дрейф, выброс). */
    signals: TrendSignal[];
}
