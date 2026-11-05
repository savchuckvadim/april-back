import { registryDefault } from '../params/registry.access';
import { MetricValue, rateMetric } from './metric';
import { minDurationSecOf, type MinDurationSecByType } from './pulse-duration';
import type {
    PulseCallRow,
    PulseManagerRow,
    PulseOptions,
    PulsePreviousWindow,
    PulseResult,
} from './pulse.types';
import { pulseWindowDays } from './pulse-window';
import { XmrPoint, xmrLimits } from './xmr';
import { lastWorkdays, previousWorkday, toPortalDate } from './workdays.util';

// Типы, пороги длительности и окно — отдельными файлами (лимит 300 строк);
// публичный путь `model/pulse` остаётся прежним.
export * from './pulse.types';
export * from './pulse-duration';
export * from './pulse-window';

export const PULSE_DEFAULTS = {
    /** Окно доли — рабочих дней (план 6.3); не параметр реестра. */
    windowWorkdays: 5,
    /** История дневного ряда XmR — рабочих дней; не параметр реестра. */
    historyWorkdays: 25,
    /** Строка менеджера — с этого числа разборов (реестр, дефолт 8). */
    managerMinN: registryDefault('pulse_manager_min_n'),
    /**
     * Точка дневного ряда XmR — с этого числа разборов за день: доля дня по
     * одному-двум звонкам — это 0 или 100 %, и «выше/ниже коридора» по ней
     * был бы шумом (05.11.2026, april-garant: один звонок дня дал «выше
     * коридора»). Не параметр реестра.
     */
    xmrDayMinN: 5,
    /**
     * Сколько звонков без даты показать у менеджера «С кем поработать»:
     * два — чтобы разобрать на планёрке, а не читать архив.
     */
    examplesPerManager: 2,
} as const;

interface DatedRow {
    row: PulseCallRow;
    day: string;
}

const isShortCall = (
    row: PulseCallRow,
    byType?: MinDurationSecByType,
): boolean =>
    row.durationSec !== null &&
    row.durationSec < minDurationSecOf(row.callType, byType);

/**
 * Разобранный звонок: есть разбор и он не короткий (длительность null —
 * ок). Карта порогов не передана — порог Фазы 1a (300 с) для всех типов.
 */
export const isAnalyzedCall = (
    row: PulseCallRow,
    byType?: MinDurationSecByType,
): boolean => row.analysisPresent && !isShortCall(row, byType);

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

function nextStepRate(
    rows: readonly DatedRow[],
    noneBelow?: number,
): MetricValue {
    return rateMetric(
        rows.filter(item => hasNextStepDate(item.row)).length,
        rows.length,
        noneBelow,
    );
}

/** Свежие первыми; при равном времени — по id (детерминированно). */
const newestFirst = (a: DatedRow, b: DatedRow): number =>
    b.row.callStartedAt.getTime() - a.row.callStartedAt.getTime() ||
    a.row.transcriptionId.localeCompare(b.row.transcriptionId);

/**
 * Строки менеджеров: порог портала решает и появление строки, и показ доли
 * числом — иначе строка с 5 разборами при пороге 5 пришла бы «мало данных».
 * У строки — звонки-примеры: без даты (разобрать) и с датой (образец).
 */
function buildByManager(
    analyzed: readonly DatedRow[],
    managerMinN: number,
): PulseManagerRow[] {
    return [...groupBy(analyzed, item => item.row.managerId).entries()]
        .filter(([, rows]) => rows.length >= managerMinN)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([managerId, rows]) => {
            const sorted = [...rows].sort(newestFirst);
            return {
                managerId,
                analyzed: rows.length,
                nextStepDateRate: nextStepRate(rows, managerMinN),
                noDateCallIds: sorted
                    .filter(item => !hasNextStepDate(item.row))
                    .slice(0, PULSE_DEFAULTS.examplesPerManager)
                    .map(item => item.row.transcriptionId),
                dateCallId:
                    sorted.find(item => hasNextStepDate(item.row))?.row
                        .transcriptionId ?? null,
            };
        });
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
 * Такое же окно перед текущим («неделей раньше»): те же правила дней;
 * разборов в нём нет — null.
 */
function buildPrevious(
    analyzed: readonly DatedRow[],
    from: string,
    options: PulseOptions,
    windowWorkdays: number,
    activeDays: ReadonlySet<string> | undefined,
): PulsePreviousWindow | null {
    const days = pulseWindowDays(
        previousWorkday(from, options.calendar),
        windowWorkdays,
        options.calendar,
        activeDays,
    );
    const prevFrom = days[0];
    const prevTo = days[days.length - 1];
    if (prevFrom === undefined || prevTo === undefined) return null;
    const rows = analyzed.filter(
        item => item.day >= prevFrom && item.day <= prevTo,
    );
    if (rows.length === 0) return null;
    return {
        from: prevFrom,
        to: prevTo,
        analyzedCalls: rows.length,
        nextStepDateRate: nextStepRate(rows),
    };
}

/**
 * Пульс дисциплины «следующий шаг с датой»: окно из windowWorkdays рабочих
 * дней (диапазон дат от первого рабочего дня до последнего включительно;
 * со skipDaysWithoutCalls дни без звонков пропускаются), доля считается
 * только по разобранным звонкам окна (isAnalyzedCall), короткие звонки —
 * в shortCallsSharePct, но не в знаменателе. Порог «короткого» —
 * options.minDurationSecByType (реестр `min_duration_sec_by_type`, тот же,
 * что у ночного конвейера); опции нет — прежний единый
 * AI_ANALYTICS_THRESHOLDS.shortCallSec. Рядом — такое же окно перед
 * текущим для сравнения. Дневной ряд — по рабочим дням истории
 * historyWorkdays, XmR — по его дням с разборами не меньше xmrDayMinN.
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
    const xmrDayMinN = options.xmrDayMinN ?? PULSE_DEFAULTS.xmrDayMinN;

    const dated: DatedRow[] = rows.map(row => ({
        row,
        day: toPortalDate(row.callStartedAt, calendar.timeZone),
    }));
    const activeDays = options.skipDaysWithoutCalls
        ? new Set(dated.map(item => item.day))
        : undefined;
    const workdays = pulseWindowDays(
        endDate,
        windowWorkdays,
        calendar,
        activeDays,
    );
    const historyDays = lastWorkdays(endDate, historyWorkdays, calendar);
    const from = workdays[0] ?? endDate;
    const to = workdays[workdays.length - 1] ?? endDate;

    const byType = options.minDurationSecByType;
    const analyzedAll = dated.filter(item => isAnalyzedCall(item.row, byType));
    const inWindow = dated.filter(item => item.day >= from && item.day <= to);
    const analyzedInWindow = inWindow.filter(item =>
        isAnalyzedCall(item.row, byType),
    );
    const shortCalls = inWindow.filter(item =>
        isShortCall(item.row, byType),
    ).length;
    const daily = buildDaily(analyzedAll, historyDays);

    return {
        window: { from, to, workdays },
        nextStepDateRate: nextStepRate(analyzedInWindow),
        previous: buildPrevious(
            analyzedAll,
            from,
            options,
            windowWorkdays,
            activeDays,
        ),
        xmr: xmrLimits(daily.filter(point => point.n >= xmrDayMinN)),
        daily,
        analyzedCalls: analyzedInWindow.length,
        shortCallsSharePct:
            inWindow.length > 0
                ? round1((shortCalls / inWindow.length) * 100)
                : 0,
        minDurationSec: minDurationSecOf(null, byType),
        managerMinN,
        byManager: buildByManager(analyzedInWindow, managerMinN),
    };
}
