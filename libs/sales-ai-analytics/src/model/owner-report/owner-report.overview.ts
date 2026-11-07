import { CALL_REPORT_OUTCOME_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-report-facts.type';
import { isWorkday, shiftDate } from '../workdays.util';
import { mondayOf, type NormalizeResult } from './owner-report.calls';
import { advancedShare, countBy, shareOf } from './owner-report.share';
import {
    OWNER_REPORT_TYPE_GROUPS,
    type OwnerReportCall,
    type OwnerReportCoverage,
    type OwnerReportOutcome,
    type OwnerReportOutcomes,
    type OwnerReportPeriod,
    type OwnerReportTelephonyFacts,
    type OwnerReportTypeGroupRow,
    type OwnerReportWeek,
} from './owner-report.types';

/**
 * Раздел «Общая картина»: исходы разговоров, конверсии по группам типов,
 * динамика по неделям, покрытие данными. Все доли — `OwnerShare` с n.
 */

const DAYS_IN_WEEK = 7;

export function countOutcomes(
    calls: readonly OwnerReportCall[],
): Record<OwnerReportOutcome, number> {
    return countBy(calls, CALL_REPORT_OUTCOME_CODES, call => call.outcome);
}

/** Разговоры с размеченным исходом — единственная база долей исходов. */
export function markedOf(calls: readonly OwnerReportCall[]): OwnerReportCall[] {
    return calls.filter(call => call.outcome !== null);
}

export function buildOutcomes(
    calls: readonly OwnerReportCall[],
): OwnerReportOutcomes {
    const byOutcome = countOutcomes(calls);
    const marked = markedOf(calls);
    const contacted = marked.filter(call => call.contactReached).length;
    return {
        byOutcome,
        unmarked: calls.length - marked.length,
        contacted,
        advancedOfContacted: shareOf(byOutcome.advanced, contacted),
        postponedWithDate: postponedWithDate(calls),
    };
}

/** Среди отложенных и перезвонов — доля с датой возврата. */
export function postponedWithDate(calls: readonly OwnerReportCall[]) {
    const byOutcome = countOutcomes(calls);
    return shareOf(
        byOutcome.callback_dated,
        byOutcome.callback_dated + byOutcome.postponed,
    );
}

/** Группы типов с хотя бы одним звонком, в порядке справочника. */
export function buildTypeGroups(
    calls: readonly OwnerReportCall[],
): OwnerReportTypeGroupRow[] {
    return OWNER_REPORT_TYPE_GROUPS.flatMap(group => {
        const rows = calls.filter(call => call.typeGroup === group);
        if (rows.length === 0) return [];
        const byOutcome = countOutcomes(rows);
        const marked = markedOf(rows);
        const contacted = marked.filter(call => call.contactReached).length;
        return [
            {
                group,
                calls: rows.length,
                byOutcome,
                unmarked: rows.length - marked.length,
                advancedOfAll: shareOf(byOutcome.advanced, marked.length),
                advancedOfContacted: shareOf(byOutcome.advanced, contacted),
            },
        ];
    });
}

/** Рабочие дни отрезка без единого звонка (разрывы данных). */
export function silentWorkdays(
    from: string,
    to: string,
    period: Pick<OwnerReportPeriod, 'calendar'>,
    activeDates: ReadonlySet<string>,
): string[] {
    const days: string[] = [];
    for (let day = from; day <= to; day = shiftDate(day, 1)) {
        if (isWorkday(day, period.calendar) && !activeDates.has(day)) {
            days.push(day);
        }
    }
    return days;
}

/** Недели периода по понедельникам ISO; неполные на границах помечены. */
export function buildWeeks(
    calls: readonly OwnerReportCall[],
    period: OwnerReportPeriod,
): OwnerReportWeek[] {
    const activeDates = new Set(calls.map(call => call.date));
    const weeks: OwnerReportWeek[] = [];
    for (
        let monday = mondayOf(period.from);
        monday <= period.to;
        monday = shiftDate(monday, DAYS_IN_WEEK)
    ) {
        const sunday = shiftDate(monday, DAYS_IN_WEEK - 1);
        const from = monday < period.from ? period.from : monday;
        const to = sunday > period.to ? period.to : sunday;
        const rows = calls.filter(call => call.weekKey === monday);
        const cold = rows.filter(call => call.typeGroup === 'cold');
        const contacted = rows.filter(call => call.contactReached === true);
        weeks.push({
            weekKey: monday,
            from,
            to,
            partial: monday < period.from || sunday > period.to,
            calls: rows.length,
            cold: cold.length,
            coldAdvanced: advancedShare(cold),
            contacted: contacted.length,
            contactedAdvanced: advancedShare(contacted),
            silentWorkdays: silentWorkdays(from, to, period, activeDates),
        });
    }
    return weeks;
}

export function buildCoverage(
    normalized: NormalizeResult,
    period: OwnerReportPeriod,
    telephony: OwnerReportTelephonyFacts | null,
): OwnerReportCoverage {
    const calls = normalized.calls;
    const fromAnalysis = markedOf(calls);
    const factsSince = fromAnalysis.reduce<string | null>(
        (earliest, call) =>
            earliest === null || call.date < earliest ? call.date : earliest,
        null,
    );
    return {
        calls:
            calls.length +
            normalized.short +
            normalized.noManager +
            normalized.noAnalysis,
        analyzed: calls.length,
        short: normalized.short,
        noManager: normalized.noManager,
        noAnalysis: normalized.noAnalysis,
        outcomeFromAnalysis: fromAnalysis.length,
        outcomeUnmarked: calls.length - fromAnalysis.length,
        factsSince,
        silentWorkdays: silentWorkdays(
            period.from,
            period.to,
            period,
            new Set(calls.map(call => call.date)),
        ),
        telephony,
    };
}
