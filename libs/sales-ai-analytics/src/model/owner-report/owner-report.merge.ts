import { shiftDate } from '../workdays.util';
import {
    addShares,
    lastDefined,
    mergeBy,
    sumBy,
    sumNullable,
    sumRecords,
    uniqueSorted,
} from './owner-report.merge.parts';
import {
    byCallsDesc,
    mergeControlMetrics,
    mergeIssueRow,
    mergeLeaks,
    mergeManagement,
    mergeManagers,
    mergeObjections,
    mergePresentations,
    mergePrices,
} from './owner-report.merge.sections';
import { ownerReportPeriodKey } from './owner-report.period';
import type {
    OwnerReportCoverage,
    OwnerReportFacts,
    OwnerReportFunnelStage,
    OwnerReportPeriod,
    OwnerReportTypeGroupRow,
    OwnerReportWeek,
} from './owner-report.types';

/**
 * Сводные факты длинного периода (квартал, полугодие, год) из месячных —
 * решение владельца 09.11.2026: длинные отчёты собираются из месячных
 * снапшотов, а не прямым расчётом по звонкам. Счётчики складываются, доли
 * пересчитываются по сумме числителей и знаменателей, средние — с весом по
 * числу разговоров, вердикты признаков управления — заново по порогам
 * месяца. Связь качества и оценка сделки — из последнего месяца. Утечки —
 * объединение месячных: масштаб считается по месяцам, где утечка входила
 * в тройку. Разделы — в owner-report.merge.sections.ts.
 */

const DAYS_IN_WEEK = 7;

export function mergeOwnerReportFacts(
    parts: readonly OwnerReportFacts[],
    period: OwnerReportPeriod,
): OwnerReportFacts {
    if (parts.length === 0) {
        throw new Error('Нечего объединять: нет месячных фактов');
    }
    return {
        period,
        composedOf: parts.map(part =>
            ownerReportPeriodKey('month', part.period.from),
        ),
        coverage: mergeCoverage(parts.map(part => part.coverage)),
        outcomes: {
            byOutcome: sumRecords(parts.map(part => part.outcomes.byOutcome)),
            unmarked: sumBy(parts, part => part.outcomes.unmarked),
            contacted: sumBy(parts, part => part.outcomes.contacted),
            advancedOfContacted: addShares(
                parts.map(part => part.outcomes.advancedOfContacted),
            ),
            postponedWithDate: addShares(
                parts.map(part => part.outcomes.postponedWithDate),
            ),
        },
        byTypeGroup: mergeBy(
            parts.flatMap(part => part.byTypeGroup),
            row => row.group,
            mergeTypeGroup,
        ),
        weeks: mergeBy(
            parts.flatMap(part => part.weeks),
            week => week.weekKey,
            mergeWeek,
        ).sort((a, b) => a.weekKey.localeCompare(b.weekKey)),
        funnel: {
            stages: mergeBy(
                parts.flatMap(part => part.funnel.stages),
                stage => stage.code,
                mergeStage,
            ),
            invoiceAgreedTotal: sumBy(
                parts,
                part => part.funnel.invoiceAgreedTotal,
            ),
        },
        presentations: mergePresentations(
            parts.map(part => part.presentations),
        ),
        qualityLink: lastDefined(parts.map(part => part.qualityLink)),
        reactivation: {
            calls: sumBy(parts, part => part.reactivation.calls),
            bySource: sumRecords(parts.map(part => part.reactivation.bySource)),
        },
        objections: mergeObjections(parts.map(part => part.objections)),
        issues: {
            callsWithIssues: addShares(
                parts.map(part => part.issues.callsWithIssues),
            ),
            byCode: mergeBy(
                parts.flatMap(part => part.issues.byCode),
                row => row.code,
                mergeIssueRow,
            ).sort(byCallsDesc),
        },
        prices: mergePrices(parts.map(part => part.prices)),
        leaks: mergeLeaks(parts.flatMap(part => part.leaks)),
        management: mergeManagement(parts.map(part => part.management)),
        controlMetrics: mergeControlMetrics(parts),
        managers: mergeManagers(parts.flatMap(part => part.managers)),
        unattributedCalls: sumBy(parts, part => part.unattributedCalls),
    };
}

function mergeCoverage(
    parts: readonly OwnerReportCoverage[],
): OwnerReportCoverage {
    const telephony = parts.map(part => part.telephony);
    return {
        calls: sumBy(parts, part => part.calls),
        analyzed: sumBy(parts, part => part.analyzed),
        short: sumBy(parts, part => part.short),
        noManager: sumBy(parts, part => part.noManager),
        noAnalysis: sumBy(parts, part => part.noAnalysis),
        outcomeFromAnalysis: sumBy(parts, part => part.outcomeFromAnalysis),
        outcomeUnmarked: sumBy(parts, part => part.outcomeUnmarked),
        factsSince:
            parts
                .map(part => part.factsSince)
                .filter((date): date is string => date !== null)
                .sort()[0] ?? null,
        silentWorkdays: uniqueSorted(
            parts.flatMap(part => part.silentWorkdays),
        ),
        telephony: telephony.every(item => item === null)
            ? null
            : {
                  outbound: sumNullable(telephony.map(item => item?.outbound)),
                  connected: sumNullable(
                      telephony.map(item => item?.connected),
                  ),
                  short: sumNullable(telephony.map(item => item?.short)),
              },
    };
}

const mergeTypeGroup = (
    group: readonly OwnerReportTypeGroupRow[],
): OwnerReportTypeGroupRow => ({
    group: group[0].group,
    calls: sumBy(group, row => row.calls),
    byOutcome: sumRecords(group.map(row => row.byOutcome)),
    unmarked: sumBy(group, row => row.unmarked),
    advancedOfAll: addShares(group.map(row => row.advancedOfAll)),
    advancedOfContacted: addShares(group.map(row => row.advancedOfContacted)),
});

/** Неделя на стыке месяцев склеивается из двух частичных; полная — если покрыты все 7 дней. */
const mergeWeek = (group: readonly OwnerReportWeek[]): OwnerReportWeek => {
    const from = [...group.map(week => week.from)].sort()[0];
    const to = [...group.map(week => week.to)].sort().reverse()[0];
    return {
        weekKey: group[0].weekKey,
        from,
        to,
        partial: shiftDate(from, DAYS_IN_WEEK - 1) !== to,
        calls: sumBy(group, week => week.calls),
        cold: sumBy(group, week => week.cold),
        coldAdvanced: addShares(group.map(week => week.coldAdvanced)),
        contacted: sumBy(group, week => week.contacted),
        contactedAdvanced: addShares(group.map(week => week.contactedAdvanced)),
        silentWorkdays: uniqueSorted(
            group.flatMap(week => week.silentWorkdays),
        ),
    };
};

const mergeStage = (
    group: readonly OwnerReportFunnelStage[],
): OwnerReportFunnelStage => ({
    code: group[0].code,
    calls: sumBy(group, stage => stage.calls),
    marked: sumBy(group, stage => stage.marked),
    advanced: addShares(group.map(stage => stage.advanced)),
    undecided: addShares(group.map(stage => stage.undecided)),
    refused: addShares(group.map(stage => stage.refused)),
    noContact: addShares(group.map(stage => stage.noContact)),
    invoiceAgreed: addShares(group.map(stage => stage.invoiceAgreed)),
});
