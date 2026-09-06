import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';
import { MetricValue, rateMetric } from './metric';
import { XmrPoint, XmrResult, xmrLimits } from './xmr';
import { WorkCalendar, lastWorkdays, toPortalDate } from './workdays.util';

/** Следующий шаг из разбора: назначен ли и есть ли дата. */
export interface PulseNextStep {
    set: boolean;
    date: string | null;
}

/** Строка звонка для пульса (lite-выборка без текста транскрипта). */
export interface PulseCallRow {
    transcriptionId: string;
    managerId: string | null;
    callStartedAt: Date;
    durationSec: number | null;
    analysisPresent: boolean;
    nextStep: PulseNextStep | null;
    riskFlags: string[];
    coachingPriority: string | null;
}

export interface PulseWindow {
    from: string;
    to: string;
    workdays: string[];
}

export interface PulseManagerRow {
    managerId: string;
    analyzed: number;
    nextStepDateRate: MetricValue;
}

export interface PulseResult {
    window: PulseWindow;
    /** Доля разобранных звонков окна с назначенным шагом и датой. */
    nextStepDateRate: MetricValue;
    /** XmR по дневным долям истории (null при < 3 дней с разборами). */
    xmr: XmrResult | null;
    /** Дневные доли по рабочим дням истории (только дни с разборами). */
    daily: XmrPoint[];
    analyzedCalls: number;
    /** Доля коротких звонков (< shortCallSec) среди всех звонков окна, %. */
    shortCallsSharePct: number;
    /** Менеджеры с analyzed ≥ managerMinN, по managerId. */
    byManager: PulseManagerRow[];
}

export interface PulseOptions {
    /** Последний день окна (YYYY-MM-DD в TZ портала). */
    endDate: string;
    calendar: WorkCalendar;
    /** Рабочих дней в окне доли (по умолчанию 5). */
    windowWorkdays?: number;
    /** Рабочих дней истории для дневного ряда XmR (по умолчанию 25). */
    historyWorkdays?: number;
    /** Минимум разобранных звонков менеджера для строки byManager (20). */
    managerMinN?: number;
}

export const PULSE_DEFAULTS = {
    windowWorkdays: 5,
    historyWorkdays: 25,
    managerMinN: 20,
} as const;

interface DatedRow {
    row: PulseCallRow;
    day: string;
}

const isShortCall = (row: PulseCallRow): boolean =>
    row.durationSec !== null &&
    row.durationSec < AI_ANALYTICS_THRESHOLDS.shortCallSec;

/** Разобранный звонок: есть разбор и он не короткий (длительность null — ок). */
export const isAnalyzedCall = (row: PulseCallRow): boolean =>
    row.analysisPresent && !isShortCall(row);

const hasNextStepDate = (row: PulseCallRow): boolean =>
    row.nextStep?.set === true &&
    row.nextStep.date !== null &&
    row.nextStep.date !== '';

const round1 = (value: number): number => Math.round(value * 10) / 10;

function groupBy<T>(
    items: readonly T[],
    keyOf: (item: T) => string | null,
): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
        const key = keyOf(item);
        if (key === null) {
            continue;
        }
        const bucket = groups.get(key) ?? [];
        bucket.push(item);
        groups.set(key, bucket);
    }
    return groups;
}

function nextStepRate(rows: readonly DatedRow[]): MetricValue {
    return rateMetric(
        rows.filter(item => hasNextStepDate(item.row)).length,
        rows.length,
    );
}

function buildByManager(
    analyzed: readonly DatedRow[],
    managerMinN: number,
): PulseManagerRow[] {
    return [...groupBy(analyzed, item => item.row.managerId).entries()]
        .filter(([, rows]) => rows.length >= managerMinN)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([managerId, rows]) => ({
            managerId,
            analyzed: rows.length,
            nextStepDateRate: nextStepRate(rows),
        }));
}

function buildDaily(
    analyzed: readonly DatedRow[],
    historyDays: readonly string[],
): XmrPoint[] {
    const byDay = groupBy(analyzed, item => item.day);
    return historyDays.flatMap(day => {
        const rows = byDay.get(day);
        if (!rows || rows.length === 0) {
            return [];
        }
        const hits = rows.filter(item => hasNextStepDate(item.row)).length;
        return [{ key: day, value: hits / rows.length, n: rows.length }];
    });
}

/**
 * Пульс дисциплины «следующий шаг с датой»: окно из windowWorkdays рабочих
 * дней (диапазон дат от первого рабочего дня до последнего включительно),
 * доля считается только по разобранным звонкам окна (isAnalyzedCall),
 * короткие звонки — в shortCallsSharePct, но не в знаменателе.
 * Дневной ряд и XmR — по рабочим дням истории historyWorkdays.
 * Чистая детерминированная функция.
 */
export function computePulse(
    rows: readonly PulseCallRow[],
    options: PulseOptions,
): PulseResult {
    const { endDate, calendar } = options;
    const windowWorkdays =
        options.windowWorkdays ?? PULSE_DEFAULTS.windowWorkdays;
    const historyWorkdays = Math.max(
        options.historyWorkdays ?? PULSE_DEFAULTS.historyWorkdays,
        windowWorkdays,
    );
    const managerMinN = options.managerMinN ?? PULSE_DEFAULTS.managerMinN;

    const workdays = lastWorkdays(endDate, windowWorkdays, calendar);
    const historyDays = lastWorkdays(endDate, historyWorkdays, calendar);
    const from = workdays[0] ?? endDate;
    const to = workdays[workdays.length - 1] ?? endDate;

    const dated: DatedRow[] = rows.map(row => ({
        row,
        day: toPortalDate(row.callStartedAt, calendar.timeZone),
    }));
    const inWindow = dated.filter(item => item.day >= from && item.day <= to);
    const analyzedInWindow = inWindow.filter(item => isAnalyzedCall(item.row));
    const shortCalls = inWindow.filter(item => isShortCall(item.row)).length;

    const daily = buildDaily(
        dated.filter(item => isAnalyzedCall(item.row)),
        historyDays,
    );

    return {
        window: { from, to, workdays },
        nextStepDateRate: nextStepRate(analyzedInWindow),
        xmr: xmrLimits(daily),
        daily,
        analyzedCalls: analyzedInWindow.length,
        shortCallsSharePct:
            inWindow.length > 0
                ? round1((shortCalls / inWindow.length) * 100)
                : 0,
        byManager: buildByManager(analyzedInWindow, managerMinN),
    };
}
