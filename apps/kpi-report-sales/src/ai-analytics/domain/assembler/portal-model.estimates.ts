/**
 * Оценки модели портала, не относящиеся к нормам рёбер (план §4.2, §4.3,
 * §4.7, §4.8): сверхдисперсия φ, псевдонаблюдения качества m_S, опорная
 * оценка S_ref, потолок дневного темпа `cap`, шкала лага `F(d)` и
 * стадийные θ в форме снапшота.
 *
 * Вынесено из `portal-model.assembler.ts`, чтобы рабочий файл остался в
 * пределах 300 строк (прецедент — `manager-month.facts.ts`). Расчёты —
 * готовые функции библиотеки, здесь только выбор входов, источник
 * значения и раскладка в нагрузку снапшота.
 *
 * Чистые функции: без DI, Bitrix и Prisma, без `new Date()` внутри.
 */
import {
    capacityQuantile,
    estimateMS,
    exponentialLagCdf,
    kaplanMeierLagCdf,
    LAG_CDF_DEFAULTS,
    medianOf,
    resolveNumberParam,
    resolveParam,
    SECTION_SHRINK_DEFAULTS,
    type CapacityDayRate,
    type LagCdf,
    type MsEstimate,
    type ParamContext,
    type QualityGroup,
    type SaleLag,
    type StageTheta,
} from '@lib/sales-ai-analytics';
import {
    AI_PORTAL_CAP_ACTIVITY,
    AI_PORTAL_CAP_FALLBACK,
    AI_PORTAL_SREF_BAND,
    AI_PORTAL_SREF_WINDOW_MONTHS,
    capFromMap,
    type AiPortalEstimateSource,
} from '../../constants/ai-portal-model.const';
import type {
    PortalEstimate,
    PortalLagCdfFacts,
    PortalManagerMonth,
    PortalStageThetaFacts,
} from './portal-model.types';

/** Источник экспозиции, при котором менеджер-месяц не идёт в потолок. */
const PROXY_DAYS_SOURCE = 'proxy';

/** Дни, на которых снимается ступенчатая таблица `F(d)` для снапшота. */
const LAG_CDF_GRID = [
    1, 3, 5, 7, 10, 14, 21, 28, 35, 42, 49, 56, 60, 75, 90,
] as const;

/** m_S с учётом реестра: оценка ANOVA либо настроенный дефолт портала. */
export interface PortalMsResult extends MsEstimate {
    /** Итоговое значение m_S с учётом переопределений реестра. */
    value: number;
}

/**
 * φ — сверхдисперсия темпов активностей. Собственной оценки в Фазе 2 нет
 * (её ставит поток темпов), поэтому значение всегда из реестра: честнее
 * показать настройку с источником `default`, чем выдать её за оценку.
 */
export function overdispersionOf(
    registry: ParamContext,
): PortalEstimate<AiPortalEstimateSource> {
    const value = resolveNumberParam('overdispersion_default', registry);

    return { value: value ?? 1, source: 'default' };
}

/**
 * m_S — псевдонаблюдения усадки средней оценки. Ценз ANOVA (≥ 5
 * менеджеров с ≥ 20 разборами) считает библиотека; реестр переопределяет
 * только НЕоценённые случаи: дефолт портала и «менеджеры неразличимы».
 */
export function msOf(
    groups: readonly QualityGroup[],
    registry: ParamContext,
): PortalMsResult {
    const estimate = estimateMS(groups);
    if (estimate.source === 'estimated') {
        return { ...estimate, value: estimate.mS };
    }
    const code =
        estimate.source === 'managers-indistinguishable'
            ? 'm_s_max'
            : 'm_s_default';
    const configured = resolveNumberParam(code, registry);

    return { ...estimate, value: configured ?? estimate.mS };
}

/** Средняя оценка менеджера за окно S_ref (взвешенная по объёму). */
function meanScoreOf(months: readonly PortalManagerMonth[]): number | null {
    const withScore = months.filter(month => month.score !== null);
    const n = withScore.reduce((sum, month) => sum + (month.score?.n ?? 0), 0);
    if (n <= 0) return null;
    const total = withScore.reduce(
        (sum, month) => sum + (month.score?.value ?? 0) * (month.score?.n ?? 0),
        0,
    );

    return total / n;
}

/**
 * S_ref — медиана средней оценки менеджеров опорной полосы стажа
 * (6–18 мес.) за три последних месяца окна. Полосы нет или оценок нет —
 * значение реестра `s_ref` с источником `default`.
 */
export function sRefOf(
    months: readonly PortalManagerMonth[],
    window: readonly string[],
    registry: ParamContext,
): PortalEstimate<AiPortalEstimateSource> {
    const recent = new Set(window.slice(-AI_PORTAL_SREF_WINDOW_MONTHS));
    const band = months.filter(
        month =>
            month.tenureBand === AI_PORTAL_SREF_BAND &&
            recent.has(month.monthKey),
    );
    const byManager = new Map<string, PortalManagerMonth[]>();
    for (const month of band) {
        byManager.set(month.managerId, [
            ...(byManager.get(month.managerId) ?? []),
            month,
        ]);
    }
    const scores = [...byManager.values()].flatMap(
        list => meanScoreOf(list) ?? [],
    );
    const fallback = resolveNumberParam('s_ref', registry);
    if (scores.length === 0) {
        return { value: fallback ?? 7, source: 'default' };
    }

    return { value: medianOf(scores), source: 'estimated' };
}

/**
 * `cap` — квантиль дневного темпа звонков (p90 полосы). Гейт «≥ 3
 * менеджера × 3 месяца без прокси» проверяет библиотека; до него
 * возвращается дефолт карты реестра `cap_level_activity`.
 */
export function capOf(
    months: readonly PortalManagerMonth[],
    registry: ParamContext,
): ReturnType<typeof capacityQuantile> {
    const configured = resolveParam('cap_level_activity', registry);
    const fallback = capFromMap(
        typeof configured.value === 'string' ? configured.value : undefined,
        AI_PORTAL_CAP_ACTIVITY,
        AI_PORTAL_CAP_FALLBACK,
    );
    const dayRates = months.flatMap((month): CapacityDayRate[] =>
        month.workedDays > 0
            ? [
                  {
                      managerId: month.managerId,
                      monthKey: month.monthKey,
                      rate: month.callsDone / month.workedDays,
                      proxy: month.daysSource === PROXY_DAYS_SOURCE,
                  },
              ]
            : [],
    );

    return capacityQuantile(dayRates, { fallback });
}

/** Ступенчатая таблица `F(d)` из непрерывной шкалы: сетка дней окна. */
function tableOf(cdf: LagCdf, windowDays: number): PortalLagCdfFacts['points'] {
    return LAG_CDF_GRID.filter(days => days <= windowDays).map(days => ({
        days,
        value: Math.round(cdf.at(days) * 1e6) / 1e6,
    }));
}

/**
 * Шкала лага «активность → оплата». За гейтом (≥ 30 закрытых продаж в
 * окне атрибуции) — Каплан–Мейер по проданным, до него — экспонента с
 * медианой цикла: честный прайор вместо пустой таблицы.
 */
export function lagCdfOf(
    lags: readonly SaleLag[],
    cycleMedianDays: number | null,
    registry: ParamContext,
): PortalLagCdfFacts {
    const windowDays =
        resolveNumberParam('lag_window_sale_days', registry) ??
        LAG_CDF_DEFAULTS.windowDays;
    const median =
        cycleMedianDays ??
        resolveNumberParam('cycle_median_days', registry) ??
        LAG_CDF_DEFAULTS.medianDays;
    const estimated = kaplanMeierLagCdf(
        lags,
        LAG_CDF_DEFAULTS.minSales,
        windowDays,
    );
    const cdf = estimated ?? exponentialLagCdf(median);

    return {
        kind: cdf.kind,
        medianDays: cdf.medianDays,
        n: cdf.n,
        points: tableOf(cdf, windowDays),
    };
}

/** Стадийные θ в форме снапшота: без функций и без лишних полей. */
export function stageThetaFactsOf(
    thetas: readonly StageTheta[],
): PortalStageThetaFacts[] {
    return thetas.map(theta => ({
        stageCode: theta.stageCode,
        order: theta.order,
        n: theta.n,
        s: theta.s,
        value: theta.value,
        w: theta.w,
        ci90: theta.ci90,
    }));
}

/** Ценз ANOVA — его же показывает витрина в «Как считаем». */
export const PORTAL_MS_GATES = SECTION_SHRINK_DEFAULTS;
