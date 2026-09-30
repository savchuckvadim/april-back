/**
 * Поля месячной модели портала Фазы 4 (план §4.4, §4.7, §4.8, §4.11, §10):
 * связь качества с результатом по данным, использование пула порталов,
 * усадка таблицы лага и гибрид медианы цикла, сезонный индекс по месяцам,
 * логнормальный чек, фактическая сверхдисперсия, входы ступеней L4/L5 и
 * источник производственного календаря в готовности.
 *
 * Вынесено из `portal-model.types.ts` по лимиту 300 строк. Все новые поля
 * нагрузки НЕОБЯЗАТЕЛЬНЫ: старые снапшоты их не несут и читаются как
 * раньше (§5.4), новые пересчёты заполняют всегда.
 *
 * Все поля JSON-сериализуемы: ни функций, ни `Date` (§3.2).
 */
import type {
    AiQualityLinkStatus,
    BetaEstimate,
    CalibrationSlope,
    ForecastBacktestSnapshot,
    LagCdfShrinkSource,
    LognormalCheckSource,
    OverdispersionPoint,
    PoolBetaLabel,
    PoolSnapshot,
    PoolStatus,
    QualityLinkSnapshot,
    QualityPoint,
    ReadinessStageGates,
    ReadinessStages,
    RecommendationEffectSnapshot,
    SeasonIndexSource,
    SnapshotReadiness,
} from '@lib/sales-ai-analytics';
import type { AiCalendarSource } from '../loaders/calendar.util';

/** Связь «качество разговора → ближний исход» в модели портала. */
export interface PortalQualityLinkFacts {
    /** Месяц оценки 'YYYY-MM'. */
    monthKey: string;
    status: AiQualityLinkStatus;
    /** Гейт пройден нужное число пересчётов подряд — режим «по данным». */
    published: boolean;
    /** Кривая `p̂(S)`; пусто без оценки. */
    curve: QualityPoint[];
    sRef: number | null;
    pRef: number | null;
    /** Оценки без поправки на надёжность: внутри менеджера, между, общая. */
    within: BetaEstimate | null;
    between: BetaEstimate | null;
    pooled: BetaEstimate | null;
    /** Надёжность предиктора и оценки с поправкой; null — поправки нет. */
    reliability: {
        r: number | null;
        rBetween: number | null;
        within: number | null;
        between: number | null;
        pooled: number | null;
    };
    /** Наклон калибровки с интервалом; null — не считался. */
    calibrationSlope: CalibrationSlope | null;
    /** Плацебо «лид»: интервал и вердикт; null — не считалось. */
    placebo: { lead: BetaEstimate; passed: boolean } | null;
    /** Пройдено пересчётов подряд и сколько нужно. */
    streak: number;
    gateMonths: number;
    /** Объём выборки: триггеров, исходов 1, менеджеров. */
    n: number;
    events: number;
    managers: number;
}

/** β пула в модели портала — только для отчёта «Как считаем». */
export interface PortalPoolBetaFacts {
    value: number;
    ci90: [number, number];
    iSquared: number;
    portals: number;
    label: PoolBetaLabel;
}

/** Что модель портала взяла из пула порталов. */
export interface PortalPoolUsageFacts {
    /** Месяц снапшота пула 'YYYY-MM'. */
    monthKey: string;
    status: PoolStatus;
    /** Порталов-участников с согласием и историей. */
    eligible: number;
    /** Рёбра, где сила усадки регуляризована к средней пула. */
    kappaEdges: string[];
    /** Сила общего прайора норм (`kappa_portal_to_global`); 0 — не подмешан. */
    globalPriorKappa: number;
    /** Таблица лага пула использована для усадки. */
    lagTable: boolean;
    /** Сезонный индекс взят из пула (своей истории мало). */
    seasonPooled: boolean;
    /** Чек пула — прайор усадки логнормального чека. */
    checkPrior: boolean;
    beta: PortalPoolBetaFacts | null;
}

/** Откуда взята таблица лага в этом пересчёте. */
export const AI_PORTAL_LAG_SOURCES = [
    'exponential',
    'kaplan-meier',
    'portal',
    'shrunk',
] as const;
export type AiPortalLagSource = (typeof AI_PORTAL_LAG_SOURCES)[number];

/** Лаг и медиана цикла: источник таблицы, вес портала, гибрид медианы. */
export interface PortalLagShrinkFacts {
    source: AiPortalLagSource | LagCdfShrinkSource;
    /** Вес собственной таблицы `w = n/(n + κ)`; 1 — усадки не было. */
    w: number;
    /** Продаж в таблице пула; null — пула нет. */
    poolN: number | null;
    /** Закрытых продаж портала в окне атрибуции. */
    sales: number;
    /** Вес медианы портала в гибриде медианы цикла. */
    cycleMedianW: number;
}

/** Сезонный индекс: 12 множителей по месяцам года и источник. */
export interface PortalSeasonIndexFacts {
    index: number[];
    source: SeasonIndexSource;
    monthsUsed: number;
    yearsUsed: number;
    /**
     * Собственный индекс портала до усадки (`s̃`, нормирован) — вход пула
     * `SI_0`; null — своей оценки нет (до гейта). Нет в старых снапшотах.
     */
    own?: number[] | null;
}

/**
 * Логнормальный чек `ln X ~ N(m, v)`. Основа — средний чек менеджер-месяца
 * (сумма продаж / число продаж), повторённый по числу продаж: сумм по
 * сделкам в месячных снапшотах нет, поэтому разброс `v` занижен.
 */
export interface PortalCheckLognormalFacts {
    m: number;
    v: number;
    n: number;
    w: number;
    source: LognormalCheckSource;
    /** Прайор усадки — чек пула (иначе реестр). */
    priorFromPool: boolean;
    /**
     * Собственная оценка портала без усадки — вход чека пула: усаженные
     * `m`, `v` уже смешаны с прайором и повторно усреднять их нельзя.
     * null — продаж меньше гейта; нет в старых снапшотах.
     */
    own?: { m: number; v: number; n: number } | null;
}

/** Фактическая оценка сверхдисперсии по неделям менеджер × тип. */
export interface PortalOverdispersionFitFacts {
    weeks: number;
    cells: number;
    /** Оценка до клипа; null — гейт по неделям не пройден. */
    phiHat: number | null;
}

/** Готовность в снапшоте модели + источник календаря (хвост 1). */
export interface PortalModelReadiness extends SnapshotReadiness {
    /** Откуда взят календарь; нет в старых снапшотах. */
    calendarSource?: AiCalendarSource;
}

/** Поля нагрузки модели портала Фазы 4. */
export interface PortalModelPhase4Fields {
    readiness: PortalModelReadiness;
    qualityLink?: PortalQualityLinkFacts | null;
    pool?: PortalPoolUsageFacts | null;
    lagShrink?: PortalLagShrinkFacts;
    seasonIndex?: PortalSeasonIndexFacts;
    checkLognormal?: PortalCheckLognormalFacts;
    overdispersionFit?: PortalOverdispersionFitFacts | null;
    /** Входы ступеней L4/L5 на момент пересчёта (с флагами портала). */
    readinessStages?: ReadinessStages;
    /** Гейты ступеней реестра портала, с которыми считался режим. */
    readinessStageGates?: ReadinessStageGates;
}

/** Входы Фазы 4 из шины, стора и контекста прогона. */
export interface PortalModelPhase4Facts {
    /** Оценка β текущего месяца (шина `qualityLink`). */
    readonly qualityLink?: QualityLinkSnapshot | null;
    /** Пул порталов (шина `pool`). */
    readonly pool?: PoolSnapshot | null;
    /** Источник производственного календаря прогона. */
    readonly calendarSource?: AiCalendarSource;
    /** Последняя проверка точности прогноза (стор). */
    readonly forecastBacktest?: ForecastBacktestSnapshot | null;
    /** Последняя оценка эффекта советов (стор). */
    readonly recommendationEffect?: RecommendationEffectSnapshot | null;
    /** Недельные точки менеджер × тип для сверхдисперсии (стор). */
    readonly weeklyActivity?: readonly OverdispersionPoint[];
}
