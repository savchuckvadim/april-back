/**
 * Оценки модели портала Фазы 4 (план §4.2, §4.7, §4.8): сверхдисперсия по
 * неделям менеджер × тип, таблица лага с усадкой к пулу и гибрид медианы
 * цикла, сезонный индекс по месячным темпам и логнормальный чек.
 *
 * Здесь только выбор входов и раскладка в снапшот — считают функции
 * библиотеки (`quasiPoissonPhi`, `kaplanMeierLagCdf`, `shrinkLagCdf`,
 * `hybridCycleMedian`, `seasonIndex`). Вынесено из
 * `portal-model.estimates.ts` по лимиту 300 строк; чек — в
 * `portal-model.check.phase4.ts`.
 *
 * Чистые функции: без DI, Bitrix и Prisma, без `new Date()` внутри.
 */
import {
    DISPERSION_DEFAULTS,
    exponentialLagCdf,
    hybridCycleMedian,
    kaplanMeierLagCdf,
    LAG_CDF_DEFAULTS,
    LAG_CDF_SHRINK_DEFAULTS,
    lagCdfFromTable,
    portalTableGate,
    quasiPoissonPhi,
    resolveNumberParam,
    SEASON_INDEX_DEFAULTS,
    seasonIndex,
    selectSaleLags,
    shrinkLagCdf,
    type LagCdf,
    type MonthlyRatePoint,
    type OverdispersionPoint,
    type ParamContext,
    type PoolSnapshot,
    type SaleLag,
} from '@lib/sales-ai-analytics';
import {
    AI_PORTAL_MODEL_WINDOW_MONTHS,
    AI_PORTAL_SEASON_NOT_ESTIMATED,
    type AiPortalEstimateSource,
} from '../../constants/ai-portal-model.const';
import { overdispersionOf, tableOf } from './portal-model.estimates';
import type {
    PortalLagShrinkFacts,
    PortalOverdispersionFitFacts,
    PortalSeasonIndexFacts,
} from './portal-model.phase4.types';
import type {
    PortalEstimate,
    PortalLagCdfFacts,
    PortalManagerMonth,
    PortalSeasonFacts,
} from './portal-model.types';

/** Подписи сезона для витрины — по-русски, без кодов. */
export const AI_PORTAL_SEASON_NOTES = {
    notEstimated: AI_PORTAL_SEASON_NOT_ESTIMATED.note,
    pooled: 'Сезонность по общим данным порталов: своей истории пока мало',
    estimated: 'Сезонность оценена по истории портала',
} as const;

/**
 * Выборка сезонного индекса (план §4.7): не меньше гейта своей оценки
 * (`minN` дескриптора `season_index` — 36 месяцев) и не меньше окна норм.
 * Окна норм (12) сезону мало: гейт не открылся бы никогда. Столько же
 * месяцев хранит снапшот менеджер-месяца (retention 36 записей).
 */
export const AI_PORTAL_SEASON_WINDOW_MONTHS = Math.max(
    AI_PORTAL_MODEL_WINDOW_MONTHS,
    SEASON_INDEX_DEFAULTS.minMonths,
);

/** Пул, по которому можно считать (оценён); иначе null. */
export const usablePool = (
    pool: PoolSnapshot | null | undefined,
): PoolSnapshot | null =>
    pool !== null && pool !== undefined && pool.status === 'estimated'
        ? pool
        : null;

/**
 * φ по недельным точкам менеджер × тип (квази-Пуассон): до гейта по
 * неделям — прайор реестра с источником `default`; точек нет вовсе —
 * прежнее значение реестра и `fit: null`.
 */
export function overdispersionPhase4Of(
    points: readonly OverdispersionPoint[] | undefined,
    registry: ParamContext,
): {
    estimate: PortalEstimate<AiPortalEstimateSource>;
    fit: PortalOverdispersionFitFacts | null;
} {
    if (points === undefined || points.length === 0) {
        return { estimate: overdispersionOf(registry), fit: null };
    }
    const result = quasiPoissonPhi(points, {
        fallback:
            resolveNumberParam('overdispersion_default', registry) ??
            DISPERSION_DEFAULTS.fallback,
    });

    return {
        estimate: { value: result.phi, source: result.source },
        fit: {
            weeks: result.weeks,
            cells: result.cells,
            phiHat: result.phiHat,
        },
    };
}

/** Таблица лага пула для усадки; нет пула или таблицы — null. */
export function poolLagTableOf(
    pool: PoolSnapshot | null | undefined,
): LagCdf | null {
    const table = usablePool(pool)?.lagCdf ?? null;

    return table === null || table.points.length === 0
        ? null
        : lagCdfFromTable(table.points, { kind: 'table', n: table.n });
}

/** Шкала лага, её источник и гибридная медиана цикла. */
export interface LagPhase4Result {
    lagCdf: PortalLagCdfFacts;
    shrink: PortalLagShrinkFacts;
    cycleMedianDays: number;
}

/**
 * Шкала лага «активность → оплата» (план §4.8): Каплан–Мейер от 30
 * закрытых продаж; от `lag_cdf_portal_min_n` — портальная таблица с
 * усадкой к таблице пула (пула нет — портал как есть); до 30 — экспонента
 * с гибридной медианой «прайор реестра → медиана портала».
 */
export function lagPhase4Of(
    lags: readonly SaleLag[],
    cycleMedianFacts: number | null,
    registry: ParamContext,
    pool: PoolSnapshot | null | undefined,
): LagPhase4Result {
    const windowDays =
        resolveNumberParam('lag_window_sale_days', registry) ??
        LAG_CDF_DEFAULTS.windowDays;
    const kappa =
        resolveNumberParam('lag_cdf_kappa', registry) ??
        LAG_CDF_SHRINK_DEFAULTS.kappa;
    const sales = selectSaleLags(lags, windowDays).filter(
        lag => !lag.censored,
    ).length;
    const km = kaplanMeierLagCdf(lags, LAG_CDF_DEFAULTS.minSales, windowDays);
    const hybrid = hybridCycleMedian({
        prior:
            resolveNumberParam('cycle_median_days', registry) ??
            LAG_CDF_DEFAULTS.medianDays,
        portalMedian: cycleMedianFacts ?? km?.medianDays ?? null,
        n: sales,
        kappa,
    });
    const global = poolLagTableOf(pool);
    const gate = portalTableGate(
        sales,
        resolveNumberParam('lag_cdf_portal_min_n', registry) ??
            LAG_CDF_SHRINK_DEFAULTS.portalMinN,
    );
    const shrunk =
        km !== null && gate
            ? shrinkLagCdf(km, global, sales, { kappa, gridDays: windowDays })
            : null;
    const cdf = shrunk ?? km ?? exponentialLagCdf(hybrid.median);

    return {
        lagCdf: {
            kind: cdf.kind,
            medianDays: cdf.medianDays,
            n: cdf.n,
            points: tableOf(cdf, windowDays),
        },
        shrink: {
            source:
                shrunk?.source ??
                (km === null ? 'exponential' : 'kaplan-meier'),
            w: shrunk?.w ?? (km === null ? 0 : 1),
            poolN: global?.n ?? null,
            sales,
            cycleMedianW: hybrid.w,
        },
        cycleMedianDays: hybrid.median,
    };
}

/**
 * Месячные темпы продаж отдела на отработанный день — вход сезона.
 * Месяцы без отработанных дней в ряд не входят.
 */
export function monthlySalesRatesOf(
    months: readonly PortalManagerMonth[],
): MonthlyRatePoint[] {
    const byMonth = new Map<string, { sales: number; days: number }>();
    for (const month of months) {
        const current = byMonth.get(month.monthKey) ?? { sales: 0, days: 0 };
        byMonth.set(month.monthKey, {
            sales: current.sales + Math.max(0, month.salesCount),
            days: current.days + Math.max(0, month.workedDays),
        });
    }

    return [...byMonth.entries()]
        .filter(([, value]) => value.days > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([monthKey, value]) => ({
            monthKey,
            ratePerWorkday: value.sales / value.days,
        }));
}

/** Номер месяца года 0..11 из ключа 'YYYY-MM'; неверный ключ — 0. */
const monthIndexOf = (monthKey: string): number => {
    const month = Number(monthKey.slice(5, 7));

    return Number.isInteger(month) && month >= 1 && month <= 12 ? month - 1 : 0;
};

/**
 * Сезонный индекс (план §4.7): своя история от 36 месяцев, до неё —
 * индекс пула, без пула — единицы с подписью «не оценена». В подпись
 * модели идёт множитель месяца модели. `months` — выборка глубиной не
 * меньше гейта (`AI_PORTAL_SEASON_WINDOW_MONTHS`), а не окно норм.
 * Собственный индекс до усадки (`own`) — вход `SI_0` пула.
 */
export function seasonPhase4Of(
    months: readonly PortalManagerMonth[],
    monthKey: string,
    registry: ParamContext,
    pool: PoolSnapshot | null | undefined,
): { season: PortalSeasonFacts; index: PortalSeasonIndexFacts } {
    const kappaYears = resolveNumberParam('kappa_season_years', registry);
    const result = seasonIndex({
        monthlyRates: monthlySalesRatesOf(months),
        pooled: usablePool(pool)?.seasonIndex ?? null,
        ...(kappaYears === undefined ? {} : { kappaYears }),
    });
    const index = [...result.index];
    const note =
        result.source === 'default'
            ? AI_PORTAL_SEASON_NOTES.notEstimated
            : result.source === 'pooled'
              ? AI_PORTAL_SEASON_NOTES.pooled
              : AI_PORTAL_SEASON_NOTES.estimated;

    return {
        season: {
            index: index[monthIndexOf(monthKey)] ?? 1,
            source: result.source === 'default' ? 'default' : 'estimated',
            note,
        },
        index: {
            index,
            source: result.source,
            monthsUsed: result.monthsUsed,
            yearsUsed: result.yearsUsed,
            own:
                result.source === 'estimated' || result.source === 'shrunk'
                    ? [...result.raw]
                    : null,
        },
    };
}
