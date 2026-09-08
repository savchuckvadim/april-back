import { AiPipelineEstimand, LagCdf } from './lag-cdf';

/**
 * Описательный прогноз продаж месяца (план `ai-sales-analytics`, §4.8;
 * Фаза 2, поток `p2-model-forecast-plan`).
 *
 * `P50 = Y₀ + λ_pipe + λ_new`, где
 * - `λ_pipe` — ожидание от **открытого** пайплайна по cure-формуле
 *   `Σ θ_j·[F(T − t_j) − F(age_j)] / (1 − θ_j·F(age_j))`: знаменатель
 *   учитывает, что дожитие до возраста `age_j` повышает вероятность быть
 *   «не покупателем»;
 * - `λ_new` — ожидание от новых активностей остатка месяца; активности
 *   появляются равномерно, поэтому доля созревших берётся как **средняя
 *   зрелость** `F̄(D_rem)`, а не значение `F(D_rem)` на последний день.
 *
 * Эквивалентная запись через конкурирующие риски (`cif`) идёт **без**
 * множителя `θ`; формы не смешиваются — портал фиксирует одну
 * (`pipeline_estimand`).
 *
 * Чистая математика: без DI, Bitrix и Prisma, без `Date.now`/`Math.random`.
 */

/** Почему ожидание от пайплайна не посчитано. */
export const AI_PIPELINE_EXPECTED_REASONS = ['no-stage-history'] as const;

/** Причина отсутствия `λ_pipe` (§5.4 «штатная деградация»). */
export type PipelineExpectedReason =
    (typeof AI_PIPELINE_EXPECTED_REASONS)[number];

/** Открытый эпизод пайплайна на дату расчёта. */
export interface PipelineEpisode {
    readonly id?: string;
    /** `age_j` — возраст эпизода в календарных днях. */
    readonly ageDays: number;
    /** `θ_j` — вероятность продажи из стадии эпизода (форма `cure`). */
    readonly theta?: number;
    /** `CIF_sale(age)` — накопленная вероятность продажи (форма `cif`). */
    readonly cifSaleAge?: number;
    /** `CIF_fail(age)` — накопленная вероятность отказа (форма `cif`). */
    readonly cifFailAge?: number;
    /** `CIF_sale(T − t)` — та же величина на горизонте (форма `cif`). */
    readonly cifSaleHorizon?: number;
}

/** Вход ожидания от открытого пайплайна. */
export interface PipelineExpectedInput {
    /** Форма оценки: `cure` (по умолчанию) или `cif`; смешивать нельзя. */
    readonly estimand?: AiPipelineEstimand;
    readonly episodes: readonly PipelineEpisode[];
    /** `F(d)` среди проданных эпизодов. */
    readonly cdf: LagCdf;
    /** `D_rem` — календарных дней до конца горизонта. */
    readonly daysRemaining: number;
    /** Есть ли история стадий нужной глубины; false → null с причиной. */
    readonly hasStageHistory?: boolean;
}

/** Ожидание от пайплайна: число либо честный null с причиной. */
export interface PipelineExpected {
    readonly value: number | null;
    readonly reason?: PipelineExpectedReason;
}

/** Путь воронки для потока новых активностей. */
export interface NewFlowPath {
    readonly code: string;
    /** `a_m,entry` — дневной темп входной активности пути. */
    readonly entryRate: number;
    /** `Π θ` по рёбрам пути от входа к продаже. */
    readonly conversion: number;
}

/** Вход ожидания от новых активностей остатка месяца. */
export interface NewFlowInput {
    readonly paths: readonly NewFlowPath[];
    /** `D_rem` — рабочих дней до конца месяца. */
    readonly daysRemaining: number;
    /** `F̄(D_rem)` — средняя зрелость (см. `meanMaturity`). */
    readonly fBar: number;
    /** `r(Ŝ)` — множитель качества; 1 в режимах `none` / `hypothesis`. */
    readonly qualityMultiplier?: number;
}

/** Вход итогового прогноза месяца. */
export interface ForecastInput {
    /** `Y₀` — продажи, уже закрытые в месяце. */
    readonly doneSales: number;
    /** `λ_pipe`; null — истории стадий нет. */
    readonly pipelineExpected: number | null;
    /** `λ_new`. */
    readonly newFlowExpected: number;
    /** Прошедшие рабочие дни месяца — для наивной базы. */
    readonly daysElapsed: number;
    /** Оставшиеся рабочие дни месяца. */
    readonly daysRemaining: number;
    /** Факт прошлого месяца — наивная база при `daysElapsed = 0`. */
    readonly lastMonthSales?: number | null;
}

/** Прогноз месяца и наивные базы для сравнения. */
export interface ForecastResult {
    /** `P50 = Y₀ + λ_pipe + λ_new`. */
    readonly p50: number;
    /** Наивная база: линейная экстраполяция темпа месяца. */
    readonly naive: number;
    /** Описательная часть `Y₀ + λ_pipe` — показывается с Фазы 2. */
    readonly descriptive: number;
    /** Известно ли `λ_pipe`: при false прогноз считается без пайплайна. */
    readonly pipelineKnown: boolean;
}

/** Вход диагностики РОПа `G′` — ожидание и потолок при том же качестве. */
export interface CeilingForecastInput {
    readonly doneSales: number;
    readonly pipelineExpected: number | null;
    readonly daysRemaining: number;
    /** Медиана апостериорного дневного темпа менеджера `a_mk`. */
    readonly expectedRate: number;
    /** `cap` — p90 дневного темпа полосы стажа; null — потолка нет. */
    readonly cap: number | null;
    /** `Π θ` от входной активности до продажи. */
    readonly conversion: number;
    readonly fBar: number;
    readonly qualityMultiplier?: number;
}

/** Два числа РОПу: ожидание по медиане темпа и потолок по capacity. */
export interface CeilingForecast {
    readonly expected: number;
    readonly ceiling: number;
}

const finite = (value: number | undefined, fallback = 0): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Вклад одного эпизода в cure-форме: `θ·ΔF / (1 − θ·F(age))`. */
function cureContribution(
    episode: PipelineEpisode,
    cdf: LagCdf,
    daysRemaining: number,
): number {
    const theta = clamp01(finite(episode.theta));
    const age = Math.max(0, finite(episode.ageDays));
    const fAge = clamp01(cdf.at(age));
    const fHorizon = clamp01(cdf.at(age + daysRemaining));
    const denominator = 1 - theta * fAge;
    if (denominator <= 0) {
        return 0;
    }

    return (theta * Math.max(0, fHorizon - fAge)) / denominator;
}

/** Вклад эпизода в форме конкурирующих рисков — **без** множителя `θ`. */
function cifContribution(episode: PipelineEpisode): number {
    const saleAge = clamp01(finite(episode.cifSaleAge));
    const failAge = clamp01(finite(episode.cifFailAge));
    const saleHorizon = clamp01(finite(episode.cifSaleHorizon, saleAge));
    const denominator = 1 - saleAge - failAge;
    if (denominator <= 0) {
        return 0;
    }

    return Math.max(0, saleHorizon - saleAge) / denominator;
}

/**
 * `λ_pipe` — ожидание продаж от открытых эпизодов. Без истории стадий
 * (`hasStageHistory = false` или вход `null`) — честный `null` с причиной,
 * а не ноль: ноль означал бы «пайплайн пуст».
 */
export function pipelineExpected(
    input: PipelineExpectedInput | null | undefined,
): PipelineExpected {
    if (!input || input.hasStageHistory === false) {
        return { value: null, reason: 'no-stage-history' };
    }
    const estimand: AiPipelineEstimand = input.estimand ?? 'cure';
    const daysRemaining = Math.max(0, finite(input.daysRemaining));
    let total = 0;
    for (const episode of input.episodes) {
        total +=
            estimand === 'cif'
                ? cifContribution(episode)
                : cureContribution(episode, input.cdf, daysRemaining);
    }

    return { value: total };
}

/**
 * `λ_new = Σ_путь D_rem·a_entry·Π θ·F̄(D_rem)` (× `r(Ŝ)` в режиме `data`).
 * При `D_rem = 0` поток новых активностей равен нулю.
 */
export function newFlowExpected(input: NewFlowInput): number {
    const days = Math.max(0, finite(input.daysRemaining));
    const fBar = Math.max(0, finite(input.fBar));
    const quality = Math.max(0, finite(input.qualityMultiplier, 1));
    if (days <= 0 || fBar <= 0) {
        return 0;
    }
    const volume = input.paths.reduce(
        (sum, path) =>
            sum +
            Math.max(0, finite(path.entryRate)) *
                Math.max(0, finite(path.conversion)),
        0,
    );

    return days * volume * fBar * quality;
}

/** `P50 = Y₀ + λ_pipe + λ_new` и наивные базы для сравнения. */
export function forecastP50(input: ForecastInput): ForecastResult {
    const done = Math.max(0, finite(input.doneSales));
    const pipeline = input.pipelineExpected;
    const pipelineKnown =
        typeof pipeline === 'number' && Number.isFinite(pipeline);
    const descriptive = done + (pipelineKnown ? pipeline : 0);
    const elapsed = Math.max(0, finite(input.daysElapsed));
    const remaining = Math.max(0, finite(input.daysRemaining));
    const naive =
        elapsed > 0
            ? (done * (elapsed + remaining)) / elapsed
            : finite(input.lastMonthSales ?? undefined, done);

    return {
        p50: descriptive + Math.max(0, finite(input.newFlowExpected)),
        naive,
        descriptive,
        pipelineKnown,
    };
}

/**
 * `G′` РОПу: `G′_expected` по медиане апостериорного темпа менеджера и
 * `G′_ceiling` при capacity. Потолок — не прогноз: удерживать p90 весь
 * остаток месяца нереально (§4.9).
 */
export function ceilingForecast(input: CeilingForecastInput): CeilingForecast {
    const base =
        Math.max(0, finite(input.doneSales)) +
        Math.max(0, finite(input.pipelineExpected ?? undefined));
    const flow = (rate: number, code: string): number =>
        newFlowExpected({
            paths: [{ code, entryRate: rate, conversion: input.conversion }],
            daysRemaining: input.daysRemaining,
            fBar: input.fBar,
            qualityMultiplier: input.qualityMultiplier,
        });
    const expected = base + flow(input.expectedRate, 'expected');
    if (input.cap === null || !Number.isFinite(input.cap)) {
        return { expected, ceiling: expected };
    }

    return { expected, ceiling: base + flow(input.cap, 'ceiling') };
}
