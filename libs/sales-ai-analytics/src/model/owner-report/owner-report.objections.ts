import {
    advancedShare,
    firstIds,
    shareOf,
    shareWhere,
    talkedOf,
} from './owner-report.share';
import type {
    OwnerReportCall,
    OwnerReportCrmFacts,
    OwnerReportIssues,
    OwnerReportObjections,
    OwnerReportObjectionTopicRow,
    OwnerReportPriceRange,
    OwnerReportPrices,
} from './owner-report.types';

/**
 * Разделы «Возражения», «Системные сбои» и «Деньги в разговорах»: темы
 * возражений × отработано × продвинут после, сбои по кодам с примерами,
 * разброс прозвучавших цен и оценка одной сделки для утечек.
 */

const EXAMPLES_LIMIT = 3;
const COLD_TOP_LIMIT = 4;
const MONTHS_IN_YEAR = 12;

/** Коды сбоев, которые говорят о качестве базы CRM. */
export const CRM_ISSUE_CODES: ReadonlySet<string> = new Set([
    'crm_duplicate',
    'wrong_contact',
]);

export function buildObjections(
    calls: readonly OwnerReportCall[],
): OwnerReportObjections {
    const contacted = talkedOf(calls);
    const withObjections = contacted.filter(call => call.objections.length > 0);
    const all = contacted.flatMap(call => call.objections);
    const topics = [
        ...new Set(
            all.flatMap(objection =>
                objection.topic === null ? [] : [objection.topic],
            ),
        ),
    ];
    const byTopic = topics
        .map(topic => topicRow(topic, contacted))
        .sort((a, b) => b.calls - a.calls || a.topic.localeCompare(b.topic));
    return {
        callsWithObjections: shareOf(withObjections.length, contacted.length),
        handled: shareWhere(all, objection => objection.handled),
        byTopic,
        topicUnmarked: all.filter(objection => objection.topic === null).length,
        coldNotAdvancedTop: coldNotAdvancedTop(calls),
    };
}

function topicRow(
    topic: string,
    contacted: readonly OwnerReportCall[],
): OwnerReportObjectionTopicRow {
    const withTopic = contacted.filter(call =>
        call.objections.some(objection => objection.topic === topic),
    );
    const objections = withTopic.flatMap(call =>
        call.objections.filter(objection => objection.topic === topic),
    );
    return {
        topic,
        n: objections.length,
        calls: withTopic.length,
        handled: shareWhere(objections, objection => objection.handled),
        advancedAfter: advancedShare(withTopic),
    };
}

/** Что чаще всего останавливает холодный вход: темы у холодных без продвижения. */
function coldNotAdvancedTop(
    calls: readonly OwnerReportCall[],
): { topic: string; calls: number }[] {
    const counts = new Map<string, number>();
    for (const call of calls) {
        if (call.typeGroup !== 'cold' || call.advanced !== false) continue;
        for (const topic of new Set(call.objections.map(o => o.topic))) {
            if (topic !== null) counts.set(topic, (counts.get(topic) ?? 0) + 1);
        }
    }
    return [...counts.entries()]
        .map(([topic, count]) => ({ topic, calls: count }))
        .sort((a, b) => b.calls - a.calls || a.topic.localeCompare(b.topic))
        .slice(0, COLD_TOP_LIMIT);
}

export function buildIssues(
    calls: readonly OwnerReportCall[],
): OwnerReportIssues {
    const marked = calls.flatMap(call =>
        call.issues === null ? [] : [{ call, issues: call.issues }],
    );
    const withIssues = marked.filter(item => item.issues.length > 0);
    const codes = [...new Set(marked.flatMap(item => item.issues))];
    const byCode = codes
        .map(code => {
            const affected = marked
                .filter(item => item.issues.includes(code))
                .map(item => item.call);
            return {
                code,
                calls: affected.length,
                examples: firstIds(
                    affected.map(call => call.transcriptionId),
                    EXAMPLES_LIMIT,
                ),
            };
        })
        .sort((a, b) => b.calls - a.calls || a.code.localeCompare(b.code));
    return {
        callsWithIssues: shareOf(withIssues.length, marked.length),
        byCode,
    };
}

function rangeOf(values: readonly number[]): OwnerReportPriceRange | null {
    if (values.length === 0) return null;
    return {
        min: Math.min(...values),
        max: Math.max(...values),
        n: values.length,
    };
}

function median(values: readonly number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildPrices(
    calls: readonly OwnerReportCall[],
    crm: OwnerReportCrmFacts | null,
): OwnerReportPrices {
    const prices = calls.flatMap(call => call.prices);
    const list = prices.filter(price => price.kind !== 'promo');
    const promo = prices.filter(price => price.kind === 'promo');
    const perMonth = (items: typeof prices): number[] =>
        items.flatMap(price =>
            price.perMonth === null ? [] : [price.perMonth],
        );
    const listPerMonth = perMonth(list);
    const periods = [
        ...new Set(
            prices.flatMap(price =>
                price.periodMonths === null ? [] : [price.periodMonths],
            ),
        ),
    ].sort((a, b) => a - b);
    const listYearMedian = median(listPerMonth.map(v => v * MONTHS_IN_YEAR));
    return {
        n: prices.length,
        listPerMonth: rangeOf(listPerMonth),
        listPerYear: rangeOf(listPerMonth.map(v => v * MONTHS_IN_YEAR)),
        promoPerMonth: rangeOf(perMonth(promo)),
        byPeriod: periods.flatMap(periodMonths => {
            const range = rangeOf(
                prices
                    .filter(price => price.periodMonths === periodMonths)
                    .map(price => price.amount),
            );
            return range ? [{ periodMonths, range }] : [];
        }),
        dealValue:
            crm?.avgCheck !== null && crm?.avgCheck !== undefined
                ? { amount: crm.avgCheck, basis: 'crm' }
                : listYearMedian !== null
                  ? { amount: listYearMedian, basis: 'prices' }
                  : null,
    };
}
