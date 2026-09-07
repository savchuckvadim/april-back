/**
 * Чистая сборка финансового слоя из отчётов sales-finance: закрытые продажи
 * месяца по менеджерам (ClosedSalesReportDto.employees) и сводка за период
 * (месяцы + пайплайн). Пайплайн из списка открытых сделок собирает
 * finance-pipeline.assembler — один запрос к Bitrix на пайплайн и «горячих».
 */
import { roundMoney } from '@lib/shared/lib/deal-finance';
import { ClosedSalesReportDto } from '../../../sales-finance';
import type { MonthSegment } from '../../../shared/lib/month-segments.util';
import { emptyManagerPipeline } from './finance-pipeline.assembler';
import type {
    AiFinanceClosedTotals,
    AiFinanceManagerMonth,
    AiFinanceManagerPipeline,
    AiFinanceManagerSummary,
    AiFinanceMonth,
} from './finance.types';

export function emptyClosedTotals(): AiFinanceClosedTotals {
    return {
        salesCount: 0,
        advanceAmount: 0,
        paidMonths: 0,
        monthlyAmount: 0,
        expectedContractAmount: 0,
    };
}

function addClosedTotals(
    target: AiFinanceClosedTotals,
    source: AiFinanceClosedTotals,
): void {
    target.salesCount += source.salesCount;
    target.advanceAmount = roundMoney(
        target.advanceAmount + source.advanceAmount,
    );
    target.paidMonths += source.paidMonths;
    target.monthlyAmount = roundMoney(
        target.monthlyAmount + source.monthlyAmount,
    );
    target.expectedContractAmount = roundMoney(
        target.expectedContractAmount + source.expectedContractAmount,
    );
}

/** Месяц финансов: строка на каждого менеджера ростера (нули без сделок). */
export function toFinanceMonth(
    segment: MonthSegment,
    report: ClosedSalesReportDto,
    managerIds: readonly number[],
): AiFinanceMonth {
    const byManager = new Map(
        report.employees.map(employee => [employee.assignedId, employee]),
    );
    const managers: AiFinanceManagerMonth[] = managerIds.map(managerId => {
        const employee = byManager.get(managerId);
        return {
            managerId,
            ...(employee
                ? {
                      salesCount: employee.dealsCount,
                      advanceAmount: employee.advanceAmount,
                      paidMonths: employee.paidMonths,
                      monthlyAmount: employee.monthlyAmount,
                      expectedContractAmount: employee.expectedContractAmount,
                  }
                : emptyClosedTotals()),
        };
    });
    const totals = emptyClosedTotals();
    managers.forEach(manager => addClosedTotals(totals, manager));
    return {
        month: segment.month,
        from: segment.from,
        to: segment.to,
        closed: segment.cacheable,
        fromCache: false,
        managers,
        totals,
    };
}

/** Сводка за период: сумма месяцев + пайплайн по каждому менеджеру ростера. */
export function summarizeManagers(
    months: readonly AiFinanceMonth[],
    pipeline: readonly AiFinanceManagerPipeline[],
    managerIds: readonly number[],
): AiFinanceManagerSummary[] {
    const pipelineById = new Map(pipeline.map(row => [row.managerId, row]));
    return managerIds.map(managerId => {
        const totals = emptyClosedTotals();
        for (const month of months) {
            const row = month.managers.find(
                item => item.managerId === managerId,
            );
            if (row) addClosedTotals(totals, row);
        }
        const live =
            pipelineById.get(managerId) ?? emptyManagerPipeline(managerId);
        return { ...totals, ...live, managerId };
    });
}
