/**
 * Чтение нагрузок снапшотов прогноза отдела для ручки `forecast` (Фаза 4,
 * поток B3): `ai-analytics-forecast-log` (дни месяца) и
 * `ai-analytics-forecast-backtest` (проверка точности). Контракт форм —
 * `ForecastLogSnapshot` / `ForecastBacktestSnapshot` библиотеки; чужая или
 * старая форма читается структурно и деградирует до «нет данных» (null),
 * а не роняет ручку.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import {
    AI_FORECAST_BACKTEST_REASONS,
    AI_FORECAST_BACKTEST_STATUSES,
    type ForecastBacktestReason,
    type ForecastBacktestStatus,
    type LognormalCheckSource,
} from '@lib/sales-ai-analytics';
import { AI_FORECAST_CHECK_SOURCES } from '../../constants/ai-forecast.const';

/** Вилка: нижняя граница, середина, верхняя граница. */
export interface ForecastBandView {
    readonly low: number;
    readonly p50: number;
    readonly high: number;
}

/** Последний день журнала прогноза отдела. */
export interface ForecastLogDayView {
    readonly day: string;
    readonly band: ForecastBandView;
    readonly level: number;
    readonly naive: number;
    readonly mean3: number | null;
    readonly done: number;
    readonly money: ForecastBandView | null;
    /**
     * Откуда чек вилки в деньгах — поле журнала месяца (общее для дней);
     * null — старая запись без источника.
     */
    readonly checkSource: LognormalCheckSource | null;
}

/** Числа проверки точности, нужные витрине. */
export interface ForecastBacktestNumbers {
    readonly coverageShare: number;
    readonly coverageCi90: readonly [number, number];
    readonly coverageTarget: number;
    readonly maseNaive: number | null;
    readonly maseMean3: number | null;
    readonly maseMax: number;
    readonly months: number;
    readonly days: number;
}

/** Снапшот проверки точности в форме витрины. */
export interface ForecastBacktestView {
    /** Ключ снапшота — закрытый месяц 'YYYY-MM'. */
    readonly monthKey: string;
    readonly status: ForecastBacktestStatus;
    readonly reasons: readonly ForecastBacktestReason[];
    readonly shadowMonths: number;
    /** Порог теневых месяцев, с которым считали; null — не записан. */
    readonly shadowMinMonths: number | null;
    /** null — журналов с фактом нет, чисел нет. */
    readonly numbers: ForecastBacktestNumbers | null;
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const count = (value: unknown): number => {
    const parsed = num(value);
    return parsed !== null && parsed >= 0 ? parsed : 0;
};

function bandOf(value: unknown): ForecastBandView | null {
    if (!isRecord(value)) return null;
    const low = num(value.low);
    const p50 = num(value.p50);
    const high = num(value.high);
    return low === null || p50 === null || high === null
        ? null
        : { low, p50, high };
}

const checkSourceOf = (value: unknown): LognormalCheckSource | null =>
    AI_FORECAST_CHECK_SOURCES.find(source => source === value) ?? null;

function dayOf(
    value: unknown,
    checkSource: LognormalCheckSource | null,
): ForecastLogDayView | null {
    if (!isRecord(value) || typeof value.day !== 'string') return null;
    const band = bandOf(value);
    const level = num(value.level);
    const naive = num(value.naive);
    const done = num(value.done);
    if (band === null || level === null || naive === null || done === null) {
        return null;
    }
    return {
        day: value.day,
        band,
        level,
        naive,
        mean3: num(value.mean3),
        done,
        money: bandOf(value.money),
        checkSource,
    };
}

/**
 * Последний (по дате) читаемый день журнала прогноза отдела; журнала нет
 * или ни одного целого дня — null.
 */
export function lastForecastLogDay(
    payload: unknown,
): ForecastLogDayView | null {
    if (!isRecord(payload) || !Array.isArray(payload.days)) return null;
    const checkSource = checkSourceOf(payload.checkSource);
    return payload.days
        .map((day: unknown) => dayOf(day, checkSource))
        .filter((day): day is ForecastLogDayView => day !== null)
        .reduce<ForecastLogDayView | null>(
            (last, day) => (last === null || day.day > last.day ? day : last),
            null,
        );
}

const isStatus = (value: unknown): value is ForecastBacktestStatus =>
    AI_FORECAST_BACKTEST_STATUSES.some(status => status === value);

const isReason = (value: unknown): value is ForecastBacktestReason =>
    AI_FORECAST_BACKTEST_REASONS.some(reason => reason === value);

function ci90Of(value: unknown): readonly [number, number] | null {
    if (!Array.isArray(value) || value.length !== 2) return null;
    const [low, high] = value.map(num);
    return low === null || high === null ? null : [low, high];
}

function numbersOf(value: unknown): ForecastBacktestNumbers | null {
    if (!isRecord(value) || !isRecord(value.coverage)) return null;
    if (!isRecord(value.mase)) return null;
    const share = num(value.coverage.share);
    const ci90 = ci90Of(value.coverage.ci90);
    const target = num(value.coverage.target);
    const maseMax = num(value.mase.max);
    if (
        share === null ||
        ci90 === null ||
        target === null ||
        maseMax === null
    ) {
        return null;
    }
    const maseOf = (key: 'naive' | 'mean3'): number | null => {
        const mase = (value.mase as Json)[key];
        return isRecord(mase) ? num(mase.value) : null;
    };
    return {
        coverageShare: share,
        coverageCi90: ci90,
        coverageTarget: target,
        maseNaive: maseOf('naive'),
        maseMean3: maseOf('mean3'),
        maseMax,
        months: Array.isArray(value.months) ? value.months.length : 0,
        days: count(value.days),
    };
}

/** Снапшот проверки точности; чужая форма (нет статуса) — null. */
export function readForecastBacktest(
    periodKey: string,
    payload: unknown,
): ForecastBacktestView | null {
    if (!isRecord(payload) || !isStatus(payload.status)) return null;
    const reasons = Array.isArray(payload.reasons)
        ? payload.reasons.filter(isReason)
        : [];
    const minMonths = num(payload.shadowMinMonths);
    return {
        monthKey:
            typeof payload.monthKey === 'string' ? payload.monthKey : periodKey,
        status: payload.status,
        reasons,
        shadowMonths: count(payload.shadowMonths),
        shadowMinMonths: minMonths !== null && minMonths > 0 ? minMonths : null,
        numbers: numbersOf(payload.backtest),
    };
}
