/**
 * Нагрузки снапшотов Фазы 4 в таблице ais (план `ai-sales-analytics-plan.md`
 * §4.4, §4.8, §4.10, §4.11, §10; план Фазы 4 `ai-sales-analytics-phase4-plan.md`).
 *
 * Контракт между потоками приложения: шаги конвейера пишут эти формы,
 * модель портала, готовность витрины, «Как считаем» и админ-ручки их
 * читают. Все поля JSON-сериализуемы: ни функций (у `LagCdf` есть `at` —
 * здесь хранятся только точки таблицы), ни `Date`. Чужая или старая форма
 * читается структурно и деградирует до «нет данных», а не роняет прогон.
 *
 * Типы снапшотов: `AI_ANALYTICS_SNAPSHOT_TYPE.qualityLink | pool |
 * forecastLog | forecastBacktest | recommendationEffect` (все portal-month,
 * ключ 'YYYY-MM', managerId = null).
 */
import type { QualityPoint } from './quality-link.types';
import type { AiSnapshotMeta } from './snapshot.types';
import type {
    AiBetaFitForm,
    AiBetaFitSpec,
    BetaEstimate,
} from '../model/beta-fit.types';
import type {
    CalibrationBin,
    CalibrationSlope,
} from '../model/beta-calibration';
import type { AiBetaGateReason } from '../model/beta-gate';
import type { BetaGateCountdown } from '../model/beta-power';
import type { AiBetaDropReason } from '../model/beta-sample.types';
import type {
    ForecastBacktest,
    ForecastBacktestReason,
    ForecastBacktestStatus,
} from '../model/forecast-backtest.types';
import type { LagCdfKind, LagCdfPoint } from '../model/lag-cdf';
import type { LognormalCheckSource } from '../model/lognormal-check';
import type { OverdispersionSource } from '../model/overdispersion';
import type {
    PoolBeta,
    PoolEdgeNorm,
    PoolEvidence,
    PoolLognormal,
    PoolPortalVerdict,
    PoolReason,
    PoolStatus,
} from '../model/pool.types';
import type {
    EdgeBeforeAfter,
    LeverEffect,
    RecommendationEffectResolvedParams,
    RecommendationGate,
    ShareWithInterval,
} from '../model/recommendation-effect.types';

// ---------------------------------------------------------------------------
// Связь качества с результатом (П15/П20)
// ---------------------------------------------------------------------------

/** Статус оценки β за месяц. */
export const AI_QUALITY_LINK_STATUSES = [
    /** Выборка мала или модель не сошлась — оценки нет, серия гейта обнулена. */
    'insufficient',
    /** Оценка есть, гейт в этом пересчёте не пройден. */
    'estimated',
    /** Гейт пройден `beta_gate_months` пересчётов подряд — режим «по данным». */
    'published',
] as const;
export type AiQualityLinkStatus = (typeof AI_QUALITY_LINK_STATUSES)[number];

/** Причины статуса `insufficient` (сверх причин гейта). */
export const AI_QUALITY_LINK_REASONS = {
    noHistory: 'no-stage-history',
    noCalls: 'no-calls',
    sampleSmall: 'sample-below-min',
    notConverged: 'not-converged',
} as const;
export type AiQualityLinkReason =
    (typeof AI_QUALITY_LINK_REASONS)[keyof typeof AI_QUALITY_LINK_REASONS];

/** Сводка выборки «звонок-триггер → ближний исход». */
export interface QualityLinkSampleFacts {
    /** Строк-триггеров с исходом. */
    readonly n: number;
    /** Строк с исходом 1 (КП/счёт в окне). */
    readonly events: number;
    readonly managers: number;
    /** Окно ближнего исхода, дней. */
    readonly windowDays: number;
    /** Отброшено по причинам. */
    readonly dropped: Readonly<Partial<Record<AiBetaDropReason, number>>>;
    /** Окно выборки: первый и последний месяц 'YYYY-MM'. */
    readonly fromMonth: string | null;
    readonly toMonth: string | null;
}

/** Надёжность предиктора, использованная в поправке. */
export interface QualityLinkReliabilityFacts {
    /** `icc_form`; null — не измерена, поправка скрыта. */
    readonly r: number | null;
    /** Надёжность среднего менеджера (Спирмен–Браун); null — `r` нет. */
    readonly rBetween: number | null;
    /** Оценки с поправкой; null — поправки нет. */
    readonly within: number | null;
    readonly between: number | null;
    readonly pooled: number | null;
}

/** Снапшот `ai-analytics-quality-link` (portal-month). */
export interface QualityLinkSnapshot {
    readonly monthKey: string;
    readonly status: AiQualityLinkStatus;
    readonly reasons: readonly (AiQualityLinkReason | AiBetaGateReason)[];
    readonly sample: QualityLinkSampleFacts;
    /** Оценки без поправки на надёжность (логит на балл качества). */
    readonly within: BetaEstimate | null;
    readonly between: BetaEstimate | null;
    readonly pooled: BetaEstimate | null;
    readonly form: Readonly<Record<AiBetaFitSpec, AiBetaFitForm>> | null;
    readonly epv: number | null;
    readonly reliability: QualityLinkReliabilityFacts;
    readonly calibration: {
        readonly slope: CalibrationSlope | null;
        readonly bins: readonly CalibrationBin[];
    };
    /** Плацебо «лид»: интервал коэффициента лида и вердикт; null — не считалось. */
    readonly placebo: {
        readonly lead: BetaEstimate;
        readonly passed: boolean;
        readonly n: number;
    } | null;
    readonly gate: {
        readonly passedNow: boolean;
        /** Пройдено пересчётов подряд, включая этот. */
        readonly streak: number;
        /** Сколько подряд нужно (`beta_gate_months`). */
        readonly months: number;
        readonly published: boolean;
        readonly timestampLeakOk: boolean;
    };
    /** Кривая `p̂(S)` по pooled-модели; пусто без оценки. */
    readonly curve: readonly QualityPoint[];
    /** Опорное качество и `p̂(S_ref)`; null — кривой нет. */
    readonly sRef: number | null;
    readonly pRef: number | null;
    /** Счётчик «до оценки связи» по фактическому дизайну выборки. */
    readonly countdown: BetaGateCountdown | null;
    readonly meta: AiSnapshotMeta;
}

// ---------------------------------------------------------------------------
// Пул порталов (П17/П22)
// ---------------------------------------------------------------------------

/** Таблица лага пула без функции `at`: точки для восстановления. */
export interface PoolLagCdfFacts {
    readonly kind: LagCdfKind;
    readonly medianDays: number | null;
    readonly n: number;
    readonly points: readonly LagCdfPoint[];
}

/** Снапшот `ai-analytics-pool` (portal-month): копия у каждого участника. */
export interface PoolSnapshot {
    readonly monthKey: string;
    readonly status: PoolStatus;
    readonly reasons: readonly PoolReason[];
    /** Порталов с согласием и историей. */
    readonly eligible: number;
    readonly edges: readonly PoolEdgeNorm[];
    readonly beta: PoolBeta | null;
    readonly lagCdf: PoolLagCdfFacts | null;
    readonly lognormal: PoolLognormal | null;
    readonly seasonIndex: readonly number[] | null;
    readonly evidence: PoolEvidence;
    /** Вердикты только по обезличенным ключам — доменов в нагрузке нет. */
    readonly portals: readonly PoolPortalVerdict[];
    /** Обезличенный ключ текущего портала — чтобы найти себя в вердиктах. */
    readonly selfKey: string;
    readonly meta: AiSnapshotMeta;
}

// ---------------------------------------------------------------------------
// Прогноз отдела: теневой журнал и точность (П16/П21)
// ---------------------------------------------------------------------------

/** День теневого журнала прогноза отдела. */
export interface ForecastLogDay {
    readonly day: string;
    /** Вилка продаж месяца (уровень `forecast_interval_level`). */
    readonly low: number;
    readonly p50: number;
    readonly high: number;
    readonly level: number;
    /** Сверхдисперсия, с которой построена вилка, и её источник. */
    readonly phi: number;
    readonly phiSource: OverdispersionSource;
    /** Простые прогнозы: темп дня и среднее трёх прошлых месяцев. */
    readonly naive: number;
    readonly mean3: number | null;
    /** Сделано на день нарастающим итогом. */
    readonly done: number;
    /** Деньги по чеку: вилка в ₽; null — чека нет. */
    readonly money: {
        readonly low: number;
        readonly p50: number;
        readonly high: number;
    } | null;
    readonly managers: number;
    /** У части менеджеров нет истории стадий — ожидание от сделок неполное. */
    readonly pipelineUnknown: number;
    readonly modelSnapshotId: string | null;
}

/** Снапшот `ai-analytics-forecast-log` (portal-month). */
export interface ForecastLogSnapshot {
    readonly monthKey: string;
    /** Дни месяца по возрастанию; один день — одна запись. */
    readonly days: readonly ForecastLogDay[];
    /** Факт продаж месяца; null — месяц не закрыт. */
    readonly actual: number | null;
    readonly checkSource: LognormalCheckSource | null;
    readonly meta: AiSnapshotMeta;
}

/** Снапшот `ai-analytics-forecast-backtest` (portal-month, ключ — закрытый месяц). */
export interface ForecastBacktestSnapshot {
    readonly monthKey: string;
    readonly status: ForecastBacktestStatus;
    readonly reasons: readonly ForecastBacktestReason[];
    /** Закрытых месяцев с журналом и фактом (теневых месяцев). */
    readonly shadowMonths: number;
    /** Сколько теневых месяцев нужно (`forecast_shadow_min_months`). */
    readonly shadowMinMonths: number;
    /** Полный результат бэктеста; null — журналов с фактом нет. */
    readonly backtest: ForecastBacktest | null;
    readonly meta: AiSnapshotMeta;
}

// ---------------------------------------------------------------------------
// Эффект советов (П18/П23)
// ---------------------------------------------------------------------------

/** Снапшот `ai-analytics-recommendation-effect` (portal-month). */
export interface RecommendationEffectSnapshot {
    /** Месяц расчёта (закрытое окно «после» для советов месяца выдачи). */
    readonly monthKey: string;
    /** Месяцы выдачи советов, вошедших в расчёт. */
    readonly issuedMonths: readonly string[];
    readonly issued: number;
    readonly completedWindows: number;
    readonly done: number;
    readonly disagree: number;
    readonly doneShare: ShareWithInterval;
    readonly disagreeShare: ShareWithInterval;
    readonly byLever: readonly LeverEffect[];
    readonly beforeAfter: readonly EdgeBeforeAfter[];
    readonly gate: RecommendationGate;
    readonly params: RecommendationEffectResolvedParams;
    /** Флаги Гудхарта из последних трендов (контроль подгонки). */
    readonly goodhart: {
        readonly flags: number;
        readonly managersWithFlags: number;
    };
    readonly meta: AiSnapshotMeta;
}
