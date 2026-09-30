/**
 * Сборка бэктеста прогноза отдела (план §10 L4; поток B2b): журналы
 * закрытых месяцев с фактом → вход библиотечного `backtestForecast` →
 * нагрузка `ai-analytics-forecast-backtest`.
 *
 * Простое среднее дня (`mean3`) пишет ночной журнал; если его не было
 * (истории меньше трёх замороженных месяцев), берётся среднее фактов трёх
 * предыдущих журналов, а без них — наивный прогноз дня: эталон тогда
 * совпадает с наивным и сравнение с ним не мягче, чем с наивным.
 *
 * Чистые функции: без DI, Bitrix и `new Date()`; случайность — только
 * переданный seed.
 */
import {
    backtestForecast,
    FORECAST_BACKTEST_DEFAULTS,
    registryDefault,
    resolveNumberParam,
    type ForecastBacktestMonth,
    type ForecastBacktestSnapshot,
    type ForecastLogSnapshot,
    type ParamContext,
} from '@lib/sales-ai-analytics';
import { AI_FORECAST_MEAN_MONTHS } from '../constants/ai-forecast-log.const';
import { monthKeysBack } from '../constants/ai-manager-snapshot.const';
import { previousMonthKey } from '../constants/ai-snapshot.const';
import type { AiSnapshotMeta } from '../domain/assembler/manager-snapshot.types';

/** Параметры гейта L4 из реестра портала. */
export interface ForecastBacktestParams {
    readonly minMonths: number;
    readonly coverageTarget: number;
    readonly maseMax: number;
    readonly level: number;
    readonly shadowMinMonths: number;
}

/** Параметры гейта L4: портал → дефолт реестра. */
export function backtestParamsOf(
    registry: ParamContext,
): ForecastBacktestParams {
    return {
        minMonths:
            resolveNumberParam('forecast_backtest_min_months', registry) ??
            FORECAST_BACKTEST_DEFAULTS.minMonths,
        coverageTarget:
            resolveNumberParam('forecast_coverage_target', registry) ??
            FORECAST_BACKTEST_DEFAULTS.coverageTarget,
        maseMax:
            resolveNumberParam('forecast_mase_max', registry) ??
            FORECAST_BACKTEST_DEFAULTS.maseMax,
        level:
            resolveNumberParam('forecast_interval_level', registry) ??
            FORECAST_BACKTEST_DEFAULTS.level,
        shadowMinMonths:
            resolveNumberParam('forecast_shadow_min_months', registry) ??
            registryDefault('forecast_shadow_min_months'),
    };
}

/** Журналы с фактом по возрастанию месяца. */
function closedLogs(
    logs: ReadonlyMap<string, ForecastLogSnapshot>,
): (ForecastLogSnapshot & { readonly actual: number })[] {
    return [...logs.values()]
        .filter(
            (log): log is ForecastLogSnapshot & { readonly actual: number } =>
                log.actual !== null,
        )
        .sort((left, right) =>
            left.monthKey < right.monthKey
                ? -1
                : left.monthKey > right.monthKey
                  ? 1
                  : 0,
        );
}

/** Среднее фактов трёх предыдущих журналов; хотя бы одного нет → null. */
function mean3FromLogs(
    monthKey: string,
    logs: ReadonlyMap<string, ForecastLogSnapshot>,
): number | null {
    const keys = monthKeysBack(
        previousMonthKey(`${monthKey}-01`),
        AI_FORECAST_MEAN_MONTHS,
    );
    let total = 0;
    for (const key of keys) {
        const actual = logs.get(key)?.actual;
        if (actual === null || actual === undefined) return null;
        total += actual;
    }

    return total / keys.length;
}

/** Закрытые журналы → месяцы бэктеста с днями-origin. */
export function backtestMonthsOf(
    logs: ReadonlyMap<string, ForecastLogSnapshot>,
): ForecastBacktestMonth[] {
    return closedLogs(logs).map(log => {
        const fallback = mean3FromLogs(log.monthKey, logs);

        return {
            monthKey: log.monthKey,
            actual: log.actual,
            days: log.days.map(day => ({
                day: day.day,
                low: day.low,
                p50: day.p50,
                high: day.high,
                naive: day.naive,
                mean3: day.mean3 ?? fallback ?? day.naive,
                done: day.done,
            })),
        };
    });
}

/** Вход сборки снапшота бэктеста. */
export interface ForecastBacktestBuildInput {
    readonly monthKey: string;
    readonly logs: ReadonlyMap<string, ForecastLogSnapshot>;
    readonly params: ForecastBacktestParams;
    /** `seedOf(domain, monthKey, calcVersion)`. */
    readonly seed: number;
    readonly meta: AiSnapshotMeta;
}

/**
 * Снапшот бэктеста: журналов с фактом нет — `insufficient` без чисел,
 * иначе полный результат библиотеки со статусом и причинами.
 */
export function buildBacktestSnapshot(
    input: ForecastBacktestBuildInput,
): ForecastBacktestSnapshot {
    const months = backtestMonthsOf(input.logs);
    if (months.length === 0) {
        return {
            monthKey: input.monthKey,
            status: 'insufficient',
            reasons: ['not-enough-months'],
            shadowMonths: 0,
            shadowMinMonths: input.params.shadowMinMonths,
            backtest: null,
            meta: input.meta,
        };
    }
    const backtest = backtestForecast({
        months,
        seed: input.seed,
        minMonths: input.params.minMonths,
        coverageTarget: input.params.coverageTarget,
        maseMax: input.params.maseMax,
        level: input.params.level,
    });

    return {
        monthKey: input.monthKey,
        status: backtest.status,
        reasons: backtest.reasons,
        shadowMonths: months.length,
        shadowMinMonths: input.params.shadowMinMonths,
        backtest,
        meta: input.meta,
    };
}
