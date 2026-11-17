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
 * Метод расчёта (17.11.2026): точность проверяется только по дням
 * текущего метода (`presentations-v2`). Дней старого метода (по звонкам,
 * поля `method` нет) в выборке нет: месяц, где их нет и других, выпадает
 * и считается в `otherMethodMonths` — по нему витрина пишет «мало истории
 * нового расчёта», пока владелец не пересчитает историю.
 *
 * Чистые функции: без DI, Bitrix и `new Date()`; случайность — только
 * переданный seed.
 */
import {
    AI_FORECAST_METHOD_CURRENT,
    backtestForecast,
    FORECAST_BACKTEST_DEFAULTS,
    forecastMethodOf,
    registryDefault,
    resolveNumberParam,
    type ForecastBacktestMonth,
    type ForecastBacktestSnapshot,
    type ForecastLogDay,
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

/** День посчитан текущим методом; нет поля — старый расчёт по звонкам. */
export const isCurrentMethodDay = (day: ForecastLogDay): boolean =>
    forecastMethodOf(day.method) === AI_FORECAST_METHOD_CURRENT;

/**
 * Закрытые журналы → месяцы бэктеста с днями-origin текущего метода.
 * Месяц, где все дни посчитаны другим методом, в бэктест не идёт (дней
 * старого метода в выборке нет вовсе); журнал вовсе без дней остаётся,
 * как прежде.
 */
export function backtestMonthsOf(
    logs: ReadonlyMap<string, ForecastLogSnapshot>,
): ForecastBacktestMonth[] {
    return closedLogs(logs).flatMap(log => {
        const days = log.days.filter(isCurrentMethodDay);
        if (log.days.length > 0 && days.length === 0) return [];
        const fallback = mean3FromLogs(log.monthKey, logs);

        return [
            {
                monthKey: log.monthKey,
                actual: log.actual,
                days: days.map(day => ({
                    day: day.day,
                    low: day.low,
                    p50: day.p50,
                    high: day.high,
                    naive: day.naive,
                    mean3: day.mean3 ?? fallback ?? day.naive,
                    done: day.done,
                })),
            },
        ];
    });
}

/** Закрытых месяцев только со днями старого метода — вне проверки. */
export function otherMethodMonthsOf(
    logs: ReadonlyMap<string, ForecastLogSnapshot>,
): number {
    return closedLogs(logs).filter(
        log => log.days.length > 0 && !log.days.some(isCurrentMethodDay),
    ).length;
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
 * Сколько журналов с фактом восстановлено по истории текущим методом:
 * хотя бы один его день воспроизведён шагом `forecast-log-replay` (живые
 * дни могли дописаться позже — месяц всё равно считается восстановленным).
 */
export function replayedMonthsOf(
    logs: ReadonlyMap<string, ForecastLogSnapshot>,
): number {
    return closedLogs(logs).filter(log =>
        log.days.some(day => day.replayed === true && isCurrentMethodDay(day)),
    ).length;
}

/**
 * Снапшот бэктеста по дням текущего метода: таких месяцев нет —
 * `insufficient` без чисел, иначе полный результат библиотеки со статусом
 * и причинами. `otherMethodMonths` — месяцы только со старым расчётом.
 */
export function buildBacktestSnapshot(
    input: ForecastBacktestBuildInput,
): ForecastBacktestSnapshot {
    const months = backtestMonthsOf(input.logs);
    const method = {
        method: AI_FORECAST_METHOD_CURRENT,
        otherMethodMonths: otherMethodMonthsOf(input.logs),
    };
    if (months.length === 0) {
        return {
            monthKey: input.monthKey,
            status: 'insufficient',
            reasons: ['not-enough-months'],
            shadowMonths: 0,
            shadowMinMonths: input.params.shadowMinMonths,
            replayedMonths: 0,
            backtest: null,
            ...method,
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
        // Покрытие — по вилке, откалиброванной по прошлым месяцам: её же
        // видит руководитель (05.11.2026, вилка модели была узкой).
        calibrate: true,
    });

    return {
        monthKey: input.monthKey,
        status: backtest.status,
        reasons: backtest.reasons,
        shadowMonths: months.length,
        shadowMinMonths: input.params.shadowMinMonths,
        replayedMonths: replayedMonthsOf(input.logs),
        backtest,
        ...method,
        meta: input.meta,
    };
}
