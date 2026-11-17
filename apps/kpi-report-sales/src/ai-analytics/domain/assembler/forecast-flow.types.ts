/**
 * Типы прогноза менеджера «от презентаций» (метод `presentations-v2`,
 * задача 17.11.2026 `2026-11-17-forecast-fix-design.md`): вход по
 * менеджеру, подбор портала на месяц и факты расчёта в снимке прогноза.
 *
 * Вынесено из `forecast.types.ts`, чтобы файлы оставались короткими. Все
 * поля JSON-сериализуемы.
 */
import type {
    AiForecastFlowSource,
    PresentationFlowFit,
    PresentationFlowReason,
    PresentationFlowStatus,
} from '@lib/sales-ai-analytics';

/** Подбор портала на месяц и месяцы, по которым он сделан. */
export interface PortalFlow {
    readonly fit: PresentationFlowFit;
    /** Месяцы подбора 'YYYY-MM' по возрастанию — раньше месяца прогноза. */
    readonly keys: readonly string[];
    /** κ_q — усадка доли менеджера (`forecast_q_kappa`). */
    readonly qKappa: number;
}

/** Вход прогноза от презентаций по одному менеджеру. */
export interface ForecastFlowManagerInput {
    /** Презентации либо (не отмечает их) свои средние продажи. */
    readonly source: AiForecastFlowSource;
    /** Презентаций с начала месяца (выбранный счётчик). */
    readonly presentationsDone: number;
    /** Презентаций в рабочий день до конца месяца. */
    readonly presentationsRate: number;
    /** Презентации прошлых месяцев: [m−1, m−2, …, m−K]. */
    readonly pastPresentations: readonly number[];
    /** q_i — продаж на презентацию после усадки к порталу. */
    readonly salesPerPresentation: number;
    /** Доля собственных данных в q_i. */
    readonly ownShare: number;
    /** Средние продажи за три прошлых месяца; null — истории нет. */
    readonly salesMean: number | null;
}

/** Факты прогноза от презентаций в снимке `ai-analytics-forecast`. */
export interface ForecastFlowFacts {
    source: AiForecastFlowSource;
    /** Итог подбора портала. */
    status: PresentationFlowStatus;
    reason: PresentationFlowReason | null;
    /** Ожидание от проведённых презентаций до конца месяца. */
    backlogExpected: number;
    /** Ожидание от презентаций, которые проведут до конца месяца. */
    freshExpected: number;
    presentationsDone: number;
    presentationsRate: number;
    salesPerPresentation: number;
    ownShare: number;
    /** w_0 — доля продаж в месяц презентации. */
    sameMonthShare: number;
    /** r — доля оставшихся рабочих дней месяца. */
    remainingShare: number;
    /** Σ_{k≥1} w_k·P_{m−k} — прошлые презентации с весами сдвига. */
    pastPresentationsEffective: number;
    salesMean: number | null;
    /** q и ρ портала. */
    portalQ: number;
    rho: number;
}
