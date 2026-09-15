import { registryDefault } from '../params/registry.access';
import { WorkCalendar, isWorkday, shiftDate } from './workdays.util';

/**
 * Источник знаменателя экспозиции менеджер-месяца (план §4.2):
 * - calendar — только рабочий календарь портала;
 * - absences — учтены заявленные РОПом отсутствия;
 * - proxy — знаменатель уменьшен по прокси-отсутствиям (серии нулевых дней);
 *   такой менеджер-месяц из оценки μ, κ и cap исключается.
 */
export type ExposureDaysSource = 'calendar' | 'absences' | 'proxy';

/** Причина исключения менеджер-месяца из оценки норм. */
export type ExposureExcludeReason = 'proxy' | 'min_workdays' | null;

/** Число событий телефонии за календарный день YYYY-MM-DD. */
export interface ExposureActivityDay {
    date: string;
    events: number;
}

export interface ExposureInput {
    /** Первый день месяца YYYY-MM-DD (включительно). */
    monthStart: string;
    /** Последний день месяца YYYY-MM-DD (включительно). */
    monthEnd: string;
    /** Календарь портала: TZ, праздники, рабочие дни недели. */
    calendar: WorkCalendar;
    /** События телефонии по дням; дни без событий можно не передавать. */
    activity: readonly ExposureActivityDay[];
    /** Доля ставки fte_m ∈ (0; 1], по умолчанию 1. */
    fte?: number;
    /** Отсутствия РОПа (override), YYYY-MM-DD. */
    absences?: readonly string[];
    /** absence_proxy_min_run, по умолчанию 3. */
    absenceProxyMinRun?: number;
    /** min_workdays_month, по умолчанию 8. */
    minWorkdaysMonth?: number;
}

export interface ExposureResult {
    /** D_calendar — рабочие дни календаря портала в месяце. */
    dCalendar: number;
    /** D_mt = fte · |рабочие дни \ отсутствия|. */
    dMt: number;
    /** D_active — дни месяца с ≥ 1 событием телефонии. */
    dActive: number;
    /** Простойные дни: нулевые серии короче absence_proxy_min_run. */
    idleDays: number;
    /** Прокси-отсутствия — серии ≥ absence_proxy_min_run нулевых дней. */
    proxyAbsenceDays: string[];
    /** Все отсутствия: заявленные РОПом + прокси. */
    absenceDays: string[];
    daysSource: ExposureDaysSource;
    /** true — менеджер-месяц не участвует в оценке μ, κ и cap. */
    excludeFromNorms: boolean;
    excludeReason: ExposureExcludeReason;
    fte: number;
}

/** Дефолты экспозиции (план §4.2) — значения только из реестра. */
export const EXPOSURE_DEFAULTS = {
    /** `absence_proxy_min_run` — длина серии нулевых дней. */
    absenceProxyMinRun: registryDefault('absence_proxy_min_run'),
    /** `min_workdays_month` — ниже менеджер-месяц не идёт в нормы. */
    minWorkdaysMonth: registryDefault('min_workdays_month'),
    /** `fte_share_default` — ставка, пока в карточке менеджера её нет. */
    fte: registryDefault('fte_share_default'),
} as const;

/** Предохранитель обхода месяца (длиннее 62 дней окна не бывает). */
const MAX_MONTH_SCAN_DAYS = 62;
const ROUND_FACTOR = 1e6;

const roundDays = (value: number): number =>
    Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;

/** Рабочие дни календаря в окне [from; to] включительно, по возрастанию. */
export function enumerateWorkdays(
    from: string,
    to: string,
    calendar: WorkCalendar,
): string[] {
    const days: string[] = [];
    let cursor = from;
    for (let scanned = 0; scanned <= MAX_MONTH_SCAN_DAYS; scanned += 1) {
        if (cursor > to) {
            break;
        }
        if (isWorkday(cursor, calendar)) {
            days.push(cursor);
        }
        cursor = shiftDate(cursor, 1);
    }
    return days;
}

interface ZeroRuns {
    /** Дни серий ≥ minRun — прокси-отсутствия. */
    proxy: string[];
    /** Дни коротких серий — простой, остаётся в знаменателе. */
    idle: number;
}

/**
 * Разделение нулевых дней на прокси-отсутствия и простой. Серия считается
 * по подряд идущим рабочим дням: праздник или выходной внутри окна серию
 * не разрывает (план §4.2, «серии ≥ absence_proxy_min_run»).
 */
export function splitZeroRuns(
    days: readonly string[],
    hasEvent: (date: string) => boolean,
    minRun: number,
): ZeroRuns {
    const proxy: string[] = [];
    let idle = 0;
    let run: string[] = [];
    const flush = (): void => {
        if (run.length >= minRun) {
            proxy.push(...run);
        } else {
            idle += run.length;
        }
        run = [];
    };
    days.forEach(day => {
        if (hasEvent(day)) {
            flush();
        } else {
            run.push(day);
        }
    });
    flush();
    return { proxy, idle };
}

function eventsByDate(
    activity: readonly ExposureActivityDay[],
    from: string,
    to: string,
): Map<string, number> {
    const map = new Map<string, number>();
    activity.forEach(day => {
        if (day.date < from || day.date > to) {
            return;
        }
        const events = Math.max(0, day.events);
        map.set(day.date, (map.get(day.date) ?? 0) + events);
    });
    return map;
}

function clampFte(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return EXPOSURE_DEFAULTS.fte;
    }
    return Math.min(1, value);
}

interface ExposureFlags {
    daysSource: ExposureDaysSource;
    excludeReason: ExposureExcludeReason;
}

/** Источник знаменателя и причина исключения менеджер-месяца из норм. */
function classifyDays(
    proxyCount: number,
    declaredCount: number,
    dMt: number,
    minWorkdays: number,
): ExposureFlags {
    if (proxyCount > 0) {
        return { daysSource: 'proxy', excludeReason: 'proxy' };
    }
    const daysSource: ExposureDaysSource =
        declaredCount > 0 ? 'absences' : 'calendar';
    return {
        daysSource,
        excludeReason: dMt < minWorkdays ? 'min_workdays' : null,
    };
}

/**
 * Три числа экспозиции менеджер-месяца (план §4.2): D_calendar, D_mt и
 * D_active. Прокси-отсутствие ставится только для серий
 * ≥ absence_proxy_min_run нулевых рабочих дней; одиночные нули остаются в
 * знаменателе и возвращаются отдельной метрикой дисциплины idleDays.
 * Менеджер-месяц с daysSource = 'proxy' либо D_mt < min_workdays_month
 * помечается excludeFromNorms: у самого менеджера показывается с подписью,
 * в оценку μ, κ и cap не идёт.
 */
export function computeExposure(input: ExposureInput): ExposureResult {
    const minRun =
        input.absenceProxyMinRun ?? EXPOSURE_DEFAULTS.absenceProxyMinRun;
    const minWorkdays =
        input.minWorkdaysMonth ?? EXPOSURE_DEFAULTS.minWorkdaysMonth;
    const fte = clampFte(input.fte);
    const workdays = enumerateWorkdays(
        input.monthStart,
        input.monthEnd,
        input.calendar,
    );
    const events = eventsByDate(
        input.activity,
        input.monthStart,
        input.monthEnd,
    );
    const declared = new Set(
        workdays.filter(day => (input.absences ?? []).includes(day)),
    );
    const scanned = workdays.filter(day => !declared.has(day));
    const runs = splitZeroRuns(
        scanned,
        day => (events.get(day) ?? 0) > 0,
        Math.max(1, minRun),
    );
    const absent = new Set([...declared, ...runs.proxy]);
    const dMt = roundDays(
        fte * workdays.filter(day => !absent.has(day)).length,
    );
    const flags = classifyDays(
        runs.proxy.length,
        declared.size,
        dMt,
        minWorkdays,
    );
    return {
        dCalendar: workdays.length,
        dMt,
        dActive: [...events.values()].filter(count => count > 0).length,
        idleDays: runs.idle,
        proxyAbsenceDays: runs.proxy,
        absenceDays: [...absent].sort((a, b) => a.localeCompare(b)),
        daysSource: flags.daysSource,
        excludeFromNorms: flags.excludeReason !== null,
        excludeReason: flags.excludeReason,
        fte,
    };
}
