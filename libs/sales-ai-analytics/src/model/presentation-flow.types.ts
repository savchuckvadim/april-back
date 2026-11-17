/**
 * Типы прогноза отдела «от презентаций» (метод `presentations-v2`, задача
 * 17.11.2026 `2026-11-17-forecast-fix-design.md`): метод и вход расчёта,
 * ряд месяцев отдела, итог подбора доли продаж на презентацию и сдвига.
 *
 * Все поля JSON-сериализуемы: итог подбора кладётся в прогноз и журнал.
 */

/**
 * Метод расчёта прогноза: `calls-v1` — вход воронки по учтённым звонкам
 * (записи до 18.11.2026, поля `method` в них нет), `presentations-v2` — от
 * отмеченных презентаций со сдвигом продажи по месяцам.
 */
export const AI_FORECAST_METHODS = ['calls-v1', 'presentations-v2'] as const;
export type AiForecastMethod = (typeof AI_FORECAST_METHODS)[number];

/** Метод, которым считаются новые записи прогноза и журнала. */
export const AI_FORECAST_METHOD_CURRENT: AiForecastMethod = 'presentations-v2';

/** Метод записи: нет поля или чужое значение — старый расчёт по звонкам. */
export function forecastMethodOf(value: unknown): AiForecastMethod {
    return AI_FORECAST_METHODS.find(method => method === value) ?? 'calls-v1';
}

/**
 * Какой счётчик KPI — вход прогноза: уникальные презентации
 * (`presentation_uniq_done`), если портал их отмечает, иначе все
 * (`presentation_done`). Один на портал и на всё окно истории.
 */
export const AI_FORECAST_ENTRIES = [
    'presentation-uniq',
    'presentation',
] as const;
export type AiForecastEntry = (typeof AI_FORECAST_ENTRIES)[number];

/**
 * Откуда ожидание менеджера: от презентаций либо, если он презентации не
 * отмечает (или портал не отмечает их вовсе), от своих средних продаж.
 */
export const AI_FORECAST_FLOW_SOURCES = [
    'presentations',
    'sales-history',
] as const;
export type AiForecastFlowSource = (typeof AI_FORECAST_FLOW_SOURCES)[number];

/**
 * Итог подбора: `estimated` — сдвиг подобран по истории; `default-lag` —
 * сдвиг по умолчанию, доля по истории; `not-applicable` — портал
 * презентации не отмечает, прогноз от них не строится.
 */
export const AI_PRESENTATION_FLOW_STATUSES = [
    'estimated',
    'default-lag',
    'not-applicable',
] as const;
export type PresentationFlowStatus =
    (typeof AI_PRESENTATION_FLOW_STATUSES)[number];

/** Почему сдвиг по умолчанию или почему прогноз от презентаций не строится. */
export const AI_PRESENTATION_FLOW_REASONS = [
    'lag-history-short',
    'lag-not-identified',
    'presentations-not-marked',
    'history-short',
    'sales-exceed-presentations',
] as const;
export type PresentationFlowReason =
    (typeof AI_PRESENTATION_FLOW_REASONS)[number];

/**
 * Как считается экспозиция: `lagged` — презентации со сдвигом по ядру,
 * `ratio` — отношение сумм без сдвига (истории мало для подбора).
 */
export type PresentationFlowExposure = 'lagged' | 'ratio';

/** Месяц отдела: суммы по всем менеджерам снимков. */
export interface FlowMonth {
    readonly monthKey: string;
    /** Месяц есть в снимках хотя бы у одного менеджера. */
    readonly known: boolean;
    /** Уникальные презентации (`presentation_uniq_done`). */
    readonly presentationsUniq: number;
    /** Все презентации (`presentation_done`). */
    readonly presentations: number;
    /** Продажи по финансам (`salesCount`). */
    readonly sales: number;
}

/** Параметры подбора (реестр портала → дефолты реестра). */
export interface PresentationFlowParams {
    /** K — `forecast_lag_max_months`. */
    readonly maxLag: number;
    /** W — `forecast_flow_window_months`. */
    readonly windowMonths: number;
    /** ρ₀ — `forecast_lag_rho_default`. */
    readonly rhoDefault: number;
    /** λ — `forget_lambda`: вес месяца λ^возраст. */
    readonly forgetLambda: number;
    /** `forecast_flow_fit_min_months`. */
    readonly minFitMonths: number;
    /** `forecast_flow_min_presentations` — за три последних месяца. */
    readonly minPresentations: number;
    /** `forecast_q_max`. */
    readonly qMax: number;
}

/** Итог подбора доли продаж на презентацию и сдвига по истории портала. */
export interface PresentationFlowFit {
    readonly status: PresentationFlowStatus;
    readonly reason: PresentationFlowReason | null;
    readonly entry: AiForecastEntry;
    /** q — продаж на презентацию (с учётом сдвига). */
    readonly q: number;
    /** ρ — затухание ядра сдвига. */
    readonly rho: number;
    /** w_0…w_K — доли продаж от презентаций месяца m−k в месяце m. */
    readonly kernel: readonly number[];
    readonly exposure: PresentationFlowExposure;
    /**
     * Вес каждого месяца входа в оценке (тот же порядок, что у месяцев);
     * 0 — месяц не участвовал. По нему считается доля менеджера.
     */
    readonly weights: readonly number[];
    /** Месяцев в оценке. */
    readonly fitMonths: number;
    /** Продаж и презентаций в оценке (без весов). */
    readonly sales: number;
    readonly presentations: number;
    /** Взвешенный девианс Пуассона; null — сдвиг не подбирался. */
    readonly deviance: number | null;
}

/** Ряд одного менеджера по тем же месяцам, что и подбор. */
export interface FlowSeries {
    /** Презентации выбранного счётчика; нет снимка — 0. */
    readonly presentations: readonly number[];
    /** Продажи; нет снимка — 0. */
    readonly sales: readonly number[];
}

/** Суммы ряда в оценке: продажи и экспозиция с весами подбора. */
export interface FlowTotals {
    readonly sales: number;
    readonly exposure: number;
}

/** Вход ожидания продаж остатка месяца от презентаций. */
export interface FlowExpectedInput {
    /** q_i — доля продаж на презентацию. */
    readonly q: number;
    /** w_0…w_K. */
    readonly kernel: readonly number[];
    /** Презентации прошлых месяцев: [m−1, m−2, …]; нет месяца — 0. */
    readonly pastPresentations: readonly number[];
    /** Презентаций с начала месяца. */
    readonly presentationsDone: number;
    /** Презентаций в рабочий день до конца месяца. */
    readonly presentationsRate: number;
    /** Рабочих дней месяца. */
    readonly daysTotal: number;
    /** Рабочих дней до конца месяца, включая сегодня. */
    readonly daysRemaining: number;
}

/** Ожидание продаж остатка месяца: от проведённых и от новых презентаций. */
export interface FlowExpected {
    /** От уже проведённых презентаций (этот и прошлые месяцы). */
    readonly backlog: number;
    /** От презентаций, которые проведут до конца месяца. */
    readonly fresh: number;
    /** r — доля оставшихся рабочих дней. */
    readonly remainingShare: number;
    /** Σ_{k≥1} w_k·P_{m−k} — прошлые презентации с весами сдвига. */
    readonly pastEffective: number;
}
