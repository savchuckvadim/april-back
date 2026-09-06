/**
 * Чистая сборка финансового слоя из отчётов sales-finance: закрытые продажи
 * месяца по менеджерам (ClosedSalesReportDto.employees) и пайплайн из
 * списка горячих сделок (HotClientsReportDto.deals). «Горячие» выделяются
 * из того же списка по порядку стадии лестницы sales_base — один запрос
 * к Bitrix на оба порога.
 */
import { PBX_DEAL_SALES_BASE_STAGES } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { roundMoney } from '@lib/shared/lib/deal-finance';
import {
    ClosedSalesReportDto,
    HotClientDealDto,
    SALES_HOT_THRESHOLD_STAGE_CODE,
    SalesHotThreshold,
} from '../../../sales-finance';
import type { MonthSegment } from '../../../shared/lib/month-segments.util';
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

/** Порядок стадии лестницы sales_base по коду стадии портала; неизвестная → 0. */
export function stageOrderOf(stageCode: string): number {
    return (
        PBX_DEAL_SALES_BASE_STAGES.find(stage => stage.code === stageCode)
            ?.order ?? 0
    );
}

/** Пайплайн от стадии + «горячие» (стадия ≥ hotThreshold) по менеджерам ростера. */
export function toPipelineByManager(
    deals: readonly HotClientDealDto[],
    managerIds: readonly number[],
    hotThreshold: SalesHotThreshold,
): AiFinanceManagerPipeline[] {
    const hotOrder = stageOrderOf(SALES_HOT_THRESHOLD_STAGE_CODE[hotThreshold]);
    const byManager = new Map<number, AiFinanceManagerPipeline>(
        managerIds.map(managerId => [
            managerId,
            {
                managerId,
                pipelineFromStage: { count: 0, monthlyAmount: 0 },
                hotEvents: 0,
            },
        ]),
    );
    for (const deal of deals) {
        const row = byManager.get(deal.assignedId);
        if (!row) continue;
        row.pipelineFromStage.count += 1;
        row.pipelineFromStage.monthlyAmount = roundMoney(
            row.pipelineFromStage.monthlyAmount + deal.monthlyAmount,
        );
        if (stageOrderOf(deal.stageCode) >= hotOrder) row.hotEvents += 1;
    }
    return [...byManager.values()];
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
        const live = pipelineById.get(managerId);
        return {
            managerId,
            ...totals,
            pipelineFromStage: live?.pipelineFromStage ?? {
                count: 0,
                monthlyAmount: 0,
            },
            hotEvents: live?.hotEvents ?? 0,
        };
    });
}
