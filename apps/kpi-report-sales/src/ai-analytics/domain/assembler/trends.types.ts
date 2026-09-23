/**
 * Нагрузка снапшота `ai-analytics-trends` (план Фазы 3, П1) в том виде, в
 * каком она ложится в `user_result` записи `ais`: ряды по метрикам с
 * доверием и порогами, плоский список сигналов для обзора и «Внимания»,
 * след калибровки семейства и версии расчёта.
 *
 * Все поля JSON-сериализуемы: `Date` внутри нагрузок запрещены (§3.2).
 */
import type {
    AiSnapshotMeta,
    ConfidenceLevel,
    TrendConfidenceReason,
    TrendSeriesCut,
    TrendSignal,
    TrendThresholds,
} from '@lib/sales-ai-analytics';
import type {
    AiTrendGrain,
    AiTrendMetric,
} from '../../constants/ai-trend.const';

/** Сигнал ряда с адресом метрики и ISO-неделей начала (для обзора). */
export interface ManagerTrendSignalFacts extends TrendSignal {
    metric: AiTrendMetric;
    grain: AiTrendGrain;
    /** ISO-неделя начала: ключ недели либо неделя первого дня месяца. */
    sinceWeek: string;
    /** Доверие к ряду, на котором стоит сигнал. */
    confidence: ConfidenceLevel;
}

/** Ряд одной метрики: объём, разрывы, доверие, пороги и сигналы. */
export interface ManagerTrendMetricFacts {
    metric: AiTrendMetric;
    grain: AiTrendGrain;
    /** Сравнимых точек ряда. */
    points: number;
    /** Что отбросила нормализация (разрывы, «мало данных»). */
    cut: TrendSeriesCut;
    /** Наблюдений (разборов, событий) под точками ряда. */
    n: number;
    confidence: ConfidenceLevel;
    reason: TrendConfidenceReason | null;
    /** σ_personal ряда; null — не определена. */
    sigma: number | null;
    /** Пороги, по которым ставились сигналы (после калибровки). */
    thresholds: TrendThresholds;
    signals: ManagerTrendSignalFacts[];
}

/** След калибровки семейства одного зерна. */
export interface TrendFamilyCalibrationFacts {
    grain: AiTrendGrain;
    /** Рядов в семействе (все менеджеры × метрики зерна). */
    series: number;
    /** Порог первого шага step-down для сдвига и дрейфа; null — семейство пусто. */
    cusumH: number | null;
    driftK: number | null;
}

/** Нагрузка снапшота трендов менеджера за неделю. */
export interface ManagerTrendsPayload {
    /** ISO-неделя расчёта (ключ записи). */
    weekKey: string;
    /** Окно рядов: ключи недель и закрытых месяцев по возрастанию. */
    window: { weeks: string[]; months: string[] };
    /** Разборов менеджера в окне недель (гейт `trend_window_calls`). */
    calls: number;
    /** Лучшее доверие среди рядов. */
    confidence: ConfidenceLevel;
    /** Причина при доверии none; иначе null. */
    reason: TrendConfidenceReason | null;
    metrics: ManagerTrendMetricFacts[];
    /** Все сигналы менеджера: сдвиги, затем дрейфы, затем выбросы. */
    signals: ManagerTrendSignalFacts[];
    calibration: {
        seed: number;
        iterations: number;
        fwer: number;
        families: TrendFamilyCalibrationFacts[];
    };
    meta: AiSnapshotMeta;
}
