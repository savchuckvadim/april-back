import {
    asBoolean,
    asNumber,
    asRecord,
    asRecordArray,
    asString,
} from './json-value.util';
import type {
    AnalyticsLiteIssue,
    AnalyticsLitePrice,
    AnalyticsLiteReportFacts,
    AnalyticsLiteSelfIntro,
} from '../types/analytics-lite.types';

/**
 * Проекция фактов для отчётов руководителю (focus-v3.1, 06.11.2026) из
 * `user_result` разбора: исход разговора, сбои, цены, допродажа,
 * самопредставление. Имена полей — из AgentCallAnalysisDto. Чего в разборе
 * нет или что не того типа → null / [] — старые разборы без этих полей дают
 * `emptyReport()`, и отчёт показывает «признак считается с даты X».
 */
export function mapLiteReport(
    analysis: Record<string, unknown> | null,
): AnalyticsLiteReportFacts {
    if (!analysis) return emptyReport();
    const upsell = asRecord(analysis.upsell);
    return {
        outcome: asString(analysis.outcome),
        issues: mapIssues(analysis.issues),
        prices: mapPrices(analysis.prices),
        upsellAttempted: upsell ? asBoolean(upsell.attempted) : null,
        upsellKind: upsell ? asString(upsell.kind) : null,
        selfIntro: mapSelfIntro(analysis.selfIntro),
    };
}

/** Факты отсутствуют (каждой строке — свои экземпляры массивов). */
export function emptyReport(): AnalyticsLiteReportFacts {
    return {
        outcome: null,
        issues: [],
        prices: [],
        upsellAttempted: null,
        upsellKind: null,
        selfIntro: null,
    };
}

/** Сбой без кода пропускается; цитата может отсутствовать. */
function mapIssues(value: unknown): AnalyticsLiteIssue[] {
    const issues: AnalyticsLiteIssue[] = [];
    for (const item of asRecordArray(value)) {
        const code = asString(item.code);
        if (code === null) continue;
        issues.push({ code, quote: asString(item.quote) });
    }
    return issues;
}

/** Цена без суммы или с отрицательной суммой пропускается. */
function mapPrices(value: unknown): AnalyticsLitePrice[] {
    const prices: AnalyticsLitePrice[] = [];
    for (const item of asRecordArray(value)) {
        const amount = asNumber(item.amount);
        if (amount === null || amount < 0) continue;
        const periodMonths = asNumber(item.periodMonths);
        prices.push({
            amount,
            periodMonths:
                periodMonths !== null && periodMonths >= 1
                    ? Math.round(periodMonths)
                    : null,
            product: asString(item.product),
            kind: asString(item.kind),
        });
    }
    return prices;
}

function mapSelfIntro(value: unknown): AnalyticsLiteSelfIntro | null {
    const record = asRecord(value);
    if (!record) return null;
    return {
        introduced: asBoolean(record.introduced),
        companyNamed: asBoolean(record.companyNamed),
        offerQuestion: asString(record.offerQuestion),
    };
}
