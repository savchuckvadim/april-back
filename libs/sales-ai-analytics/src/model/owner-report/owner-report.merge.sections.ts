import {
    OWNER_REPORT_EXAMPLES_LIMIT,
    OWNER_REPORT_LEAKS_LIMIT,
} from './owner-report.leaks';
import { managementVerdictOf, signVerdictOf } from './owner-report.management';
import {
    addShares,
    lastDefined,
    mergeBy,
    mergeRanges,
    sumBy,
    sumNullable,
    weightedAvg,
} from './owner-report.merge.parts';
import { OWNER_REPORT_COLD_TOP_LIMIT } from './owner-report.objections';
import { firstIds, shareOf } from './owner-report.share';
import type {
    OwnerReportControlMetric,
    OwnerReportCrmManagerFacts,
    OwnerReportFacts,
    OwnerReportIssueRow,
    OwnerReportLeak,
    OwnerReportManagement,
    OwnerReportManagerRow,
    OwnerReportObjections,
    OwnerReportPresentations,
    OwnerReportPrices,
    OwnerShare,
} from './owner-report.types';

/**
 * Слияние разделов месячных фактов (презентации, возражения, сбои, цены,
 * утечки, управление, метрики контроля, сотрудники). Вынесено из
 * owner-report.merge.ts по лимиту файла; правила — те же: счётчики
 * складываются, доли по сумме, средние с весом, вердикты по порогам месяца.
 */

export const byCallsDesc = <T extends { calls: number }>(a: T, b: T): number =>
    b.calls - a.calls;

export function mergePresentations(
    parts: readonly OwnerReportPresentations[],
): OwnerReportPresentations {
    const share = (pick: (part: OwnerReportPresentations) => OwnerShare) =>
        addShares(parts.map(pick));
    return {
        calls: sumBy(parts, part => part.calls),
        marked: sumBy(parts, part => part.marked),
        advanced: share(part => part.advanced),
        needsFound: share(part => part.needsFound),
        byNeeds: share(part => part.byNeeds),
        advancedByNeeds: share(part => part.advancedByNeeds),
        advancedTemplate: share(part => part.advancedTemplate),
        closingAttempted: share(part => part.closingAttempted),
        nextStepDated: share(part => part.nextStepDated),
        objectionsHandled: share(part => part.objectionsHandled),
        sectionScores: mergeBy(
            parts.flatMap(part => part.sectionScores),
            score => score.section,
            group => ({
                section: group[0].section,
                avg:
                    weightedAvg(
                        group.map(score => ({
                            value: score.avg,
                            weight: score.n,
                        })),
                    ) ?? 0,
                n: sumBy(group, score => score.n),
            }),
        ),
        byManager: mergeBy(
            parts.flatMap(part => part.byManager),
            row => row.managerId,
            group => ({
                managerId: group[0].managerId,
                calls: sumBy(group, row => row.calls),
                advanced: addShares(group.map(row => row.advanced)),
                byNeeds: addShares(group.map(row => row.byNeeds)),
            }),
        ).sort(byCallsDesc),
    };
}

export function mergeObjections(
    parts: readonly OwnerReportObjections[],
): OwnerReportObjections {
    return {
        callsWithObjections: addShares(
            parts.map(part => part.callsWithObjections),
        ),
        handled: addShares(parts.map(part => part.handled)),
        byTopic: mergeBy(
            parts.flatMap(part => part.byTopic),
            row => row.topic,
            group => ({
                topic: group[0].topic,
                n: sumBy(group, row => row.n),
                calls: sumBy(group, row => row.calls),
                handled: addShares(group.map(row => row.handled)),
                advancedAfter: addShares(group.map(row => row.advancedAfter)),
            }),
        ).sort(byCallsDesc),
        topicUnmarked: sumBy(parts, part => part.topicUnmarked),
        coldNotAdvancedTop: mergeBy(
            parts.flatMap(part => part.coldNotAdvancedTop),
            row => row.topic,
            group => ({
                topic: group[0].topic,
                calls: sumBy(group, row => row.calls),
            }),
        )
            .sort(byCallsDesc)
            .slice(0, OWNER_REPORT_COLD_TOP_LIMIT),
    };
}

export const mergeIssueRow = (
    group: readonly OwnerReportIssueRow[],
): OwnerReportIssueRow => ({
    code: group[0].code,
    calls: sumBy(group, row => row.calls),
    examples: firstIds(
        group.flatMap(row => row.examples),
        OWNER_REPORT_EXAMPLES_LIMIT,
    ),
});

export function mergePrices(
    parts: readonly OwnerReportPrices[],
): OwnerReportPrices {
    return {
        n: sumBy(parts, part => part.n),
        listPerMonth: mergeRanges(parts.map(part => part.listPerMonth)),
        listPerYear: mergeRanges(parts.map(part => part.listPerYear)),
        promoPerMonth: mergeRanges(parts.map(part => part.promoPerMonth)),
        byPeriod: mergeBy(
            parts.flatMap(part => part.byPeriod),
            row => row.periodMonths,
            group => ({
                periodMonths: group[0].periodMonths,
                range:
                    mergeRanges(group.map(row => row.range)) ?? group[0].range,
            }),
        ).sort((a, b) => a.periodMonths - b.periodMonths),
        dealValue: lastDefined(parts.map(part => part.dealValue)),
    };
}

/** Утечки: объединение месячных; масштаб — по месяцам, где утечка входила в тройку. */
export function mergeLeaks(
    leaks: readonly OwnerReportLeak[],
): OwnerReportLeak[] {
    return mergeBy(
        leaks,
        leak => leak.code,
        group => {
            const money = group
                .map(leak => leak.money)
                .filter(
                    (item): item is NonNullable<OwnerReportLeak['money']> =>
                        item !== null,
                );
            return {
                code: group[0].code,
                scale: addShares(group.map(leak => leak.scale)),
                money:
                    money.length === 0
                        ? null
                        : {
                              amount: sumBy(money, item => item.amount),
                              deals: sumBy(money, item => item.deals),
                              basis: money[0].basis,
                          },
                nature: group[0].nature,
                examples: firstIds(
                    group.flatMap(leak => leak.examples),
                    OWNER_REPORT_EXAMPLES_LIMIT,
                ),
            };
        },
    )
        .sort((a, b) => (b.scale.pct ?? -1) - (a.scale.pct ?? -1))
        .slice(0, OWNER_REPORT_LEAKS_LIMIT);
}

/** Признаки управления: значение с весом по n, вердикт заново по порогам месяца. */
export function mergeManagement(
    parts: readonly OwnerReportManagement[],
): OwnerReportManagement {
    const signs = mergeBy(
        parts.flatMap(part => part.signs),
        sign => sign.code,
        group => {
            const value = weightedAvg(
                group.map(sign => ({ value: sign.value, weight: sign.n })),
            );
            return {
                code: group[0].code,
                value,
                n: sumBy(group, sign => sign.n),
                verdict: signVerdictOf(group[0].code, value),
            };
        },
    );
    return { signs, verdict: managementVerdictOf(signs) };
}

/** Метрики контроля: доля за весь период, «последняя неделя» — из последнего месяца. */
export function mergeControlMetrics(
    parts: readonly OwnerReportFacts[],
): OwnerReportControlMetric[] {
    const last = parts[parts.length - 1];
    return mergeBy(
        parts.flatMap(part => part.controlMetrics),
        metric => metric.code,
        group => ({
            code: group[0].code,
            direction: group[0].direction,
            share: addShares(group.map(metric => metric.share)),
            lastWeek:
                last.controlMetrics.find(
                    metric => metric.code === group[0].code,
                )?.lastWeek ?? null,
        }),
    );
}

function mergeCrm(
    parts: readonly (OwnerReportCrmManagerFacts | null)[],
): OwnerReportCrmManagerFacts | null {
    const known = parts.filter(
        (part): part is OwnerReportCrmManagerFacts => part !== null,
    );
    if (known.length === 0) return null;
    return {
        deals: sumBy(known, part => part.deals),
        invoices: sumBy(known, part => part.invoices),
        presentations: sumBy(known, part => part.presentations),
        plan: sumNullable(known.map(part => part.plan)),
        salesAmount: sumNullable(known.map(part => part.salesAmount)),
    };
}

/** Сотрудники: суммы по каждому, доля в команде — по общему числу разговоров. */
export function mergeManagers(
    rows: readonly OwnerReportManagerRow[],
): OwnerReportManagerRow[] {
    const teamCalls = sumBy(rows, row => row.calls);
    const share = (
        group: readonly OwnerReportManagerRow[],
        pick: (row: OwnerReportManagerRow) => OwnerShare,
    ): OwnerShare => addShares(group.map(pick));
    return mergeBy(
        rows,
        row => row.managerId,
        group => ({
            managerId: group[0].managerId,
            calls: sumBy(group, row => row.calls),
            shareOfTeam: shareOf(
                sumBy(group, row => row.calls),
                teamCalls,
            ),
            coldAdvanced: share(group, row => row.coldAdvanced),
            contactedAdvanced: share(group, row => row.contactedAdvanced),
            reactivationAdvanced: share(group, row => row.reactivationAdvanced),
            needsFound: share(group, row => row.needsFound),
            presentationByNeeds: share(group, row => row.presentationByNeeds),
            closingAttempted: share(group, row => row.closingAttempted),
            nextStepDated: share(group, row => row.nextStepDated),
            objectionsHandled: share(group, row => row.objectionsHandled),
            postponedWithDate: share(group, row => row.postponedWithDate),
            conflict: share(group, row => row.conflict),
            evasive: share(group, row => row.evasive),
            advancedShareOfTeam: share(group, row => row.advancedShareOfTeam),
            upsellShareOfTeam: share(group, row => row.upsellShareOfTeam),
            avgScore: weightedAvg(
                group.map(row => ({ value: row.avgScore, weight: row.calls })),
            ),
            issues: sumBy(group, row => row.issues),
            crm: mergeCrm(group.map(row => row.crm)),
        }),
    ).sort(
        (a, b) => byCallsDesc(a, b) || a.managerId.localeCompare(b.managerId),
    );
}
