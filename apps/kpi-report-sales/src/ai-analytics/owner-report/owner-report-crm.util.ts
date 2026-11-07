import type {
    OwnerReportCrmFacts,
    OwnerReportCrmManagerFacts,
} from '@lib/sales-ai-analytics';
import {
    enabledPlanIndicators,
    PLAN_INDICATOR_CODES,
    planForRange,
} from '../../plans';
import type { AiFinanceResult } from '../domain/loaders/finance.types';
import type { AiKpiMonthsResult } from '../domain/loaders/kpi.types';
import type { AiPlansResult } from '../domain/loaders/plans.types';

/**
 * CRM-факты отчёта собственнику из загрузчиков вкладки AI — чистая
 * сборка, те же числа, что в обзоре и блоке «Планы»:
 * - сделки и деньги — закрытые продажи периода (sales-finance, как
 *   вкладка «Финансы»): число сделок, месячная сумма продаж, сумма
 *   договоров;
 * - счета и показы — KPI-отчёт по месяцам периода (счета `act_send`,
 *   уникальные презентации — канон витрины);
 * - план — показатель «Месячная сумма продаж» блока «Планы», если он
 *   включён на портале, пересчитанный на даты периода (planForRange);
 * - средний чек — сумма договоров / число закрытых сделок по отделу.
 * Любой источник может отсутствовать (fail-open загрузчика): без
 * финансов деньги и сделки — null/0, без обоих источников — null целиком.
 */

export interface OwnerReportCrmInput {
    kpi: AiKpiMonthsResult | null;
    finance: AiFinanceResult | null;
    plans: AiPlansResult | null;
    /** Границы периода, yyyy-MM-dd включительно. */
    from: string;
    to: string;
    /** Периметр отдела (Bitrix ID строками). */
    managerIds: readonly string[];
}

export function buildOwnerReportCrmFacts(
    input: OwnerReportCrmInput,
): OwnerReportCrmFacts | null {
    const { kpi, finance, plans } = input;
    if (!kpi && !finance) return null;
    const planPeriod = salesPlanPeriodType(plans);
    const byManager: Record<string, OwnerReportCrmManagerFacts> = {};
    for (const managerId of input.managerIds) {
        const id = Number(managerId);
        const summary = finance?.managers.find(row => row.managerId === id);
        const target = plans?.managers.find(row => row.managerId === id);
        const monthly =
            target?.targets[PLAN_INDICATOR_CODES.sales_monthly_amount];
        const plan =
            planPeriod && typeof monthly === 'number' && monthly > 0
                ? planForRange(monthly, planPeriod, input.from, input.to)
                : null;
        byManager[managerId] = {
            deals: summary?.salesCount ?? 0,
            invoices: sumKpi(kpi, id, row => row.documents.invoices),
            presentations: sumKpi(kpi, id, row => row.presentationsUniq.done),
            plan,
            salesAmount: finance ? (summary?.monthlyAmount ?? 0) : null,
        };
    }
    return { byManager, avgCheck: avgCheckOf(finance, input.managerIds) };
}

/** Период, на который задан план «Месячная сумма продаж»; выключен — null. */
function salesPlanPeriodType(plans: AiPlansResult | null) {
    const config = plans?.config;
    if (!config) return null;
    return (
        enabledPlanIndicators(config).find(
            item => item.code === PLAN_INDICATOR_CODES.sales_monthly_amount,
        )?.periodType ?? null
    );
}

function sumKpi(
    kpi: AiKpiMonthsResult | null,
    managerId: number,
    pick: (
        row: AiKpiMonthsResult['months'][number]['managers'][number],
    ) => number,
): number {
    if (!kpi) return 0;
    return kpi.months.reduce((sum, month) => {
        const row = month.managers.find(item => item.managerId === managerId);
        return sum + (row ? pick(row) : 0);
    }, 0);
}

/** Средняя сумма договора по закрытым сделкам отдела; без сделок — null. */
function avgCheckOf(
    finance: AiFinanceResult | null,
    managerIds: readonly string[],
): number | null {
    if (!finance) return null;
    const ids = new Set(managerIds.map(Number));
    let deals = 0;
    let amount = 0;
    for (const row of finance.managers) {
        if (!ids.has(row.managerId)) continue;
        deals += row.salesCount;
        amount += row.expectedContractAmount;
    }
    return deals > 0 && amount > 0 ? Math.round(amount / deals) : null;
}
