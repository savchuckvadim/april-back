import { normalizeOwnerReportCalls } from './owner-report.calls';
import { buildLeaks } from './owner-report.leaks';
import {
    buildControlMetrics,
    buildManagement,
} from './owner-report.management';
import { buildManagerRows } from './owner-report.managers';
import {
    buildIssues,
    buildObjections,
    buildPrices,
} from './owner-report.objections';
import {
    buildCoverage,
    buildOutcomes,
    buildTypeGroups,
    buildWeeks,
} from './owner-report.overview';
import type {
    OwnerReportCallInput,
    OwnerReportFacts,
    OwnerReportOptions,
    OwnerReportPeriod,
} from './owner-report.types';

/**
 * Факты отчёта собственнику за период из lite-строк звонков и фактов
 * приложения (телефония, CRM). Чистая функция: время — только в строках и
 * границах периода, `new Date()` внутри запрещён.
 */
export function buildOwnerReportFacts(
    rows: readonly OwnerReportCallInput[],
    period: OwnerReportPeriod,
    options: OwnerReportOptions = {},
): OwnerReportFacts {
    const normalized = normalizeOwnerReportCalls(rows, {
        from: period.from,
        to: period.to,
        timeZone: period.timeZone,
        minDurationByType: options.minDurationByType,
        managerIds: options.managerIds,
    });
    const calls = normalized.calls;
    const crm = options.crm ?? null;
    const coverage = buildCoverage(
        normalized,
        period,
        options.telephony ?? null,
    );
    const prices = buildPrices(calls, crm);
    const weeks = buildWeeks(calls, period);
    return {
        period,
        coverage,
        outcomes: buildOutcomes(calls),
        byTypeGroup: buildTypeGroups(calls),
        weeks,
        objections: buildObjections(calls),
        issues: buildIssues(calls),
        prices,
        leaks: buildLeaks(calls, prices),
        management: buildManagement({ calls, crm }),
        controlMetrics: buildControlMetrics(calls, weeks),
        managers: buildManagerRows(calls, crm),
        unattributedCalls: normalized.noManager,
    };
}
