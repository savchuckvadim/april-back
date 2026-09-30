/**
 * Чистая сборка финансового слоя из отчёта sales-finance за ВЕСЬ период
 * (один вызов ClosedSalesUseCase, как у вкладки «Финансы»):
 * - сводка по менеджеру — итоги сотрудника из отчёта как есть (те же
 *   числа, что в «Финансах» за эти даты) + пайплайн;
 * - помесячная разбивка для ночного шага finance и месячного снапшота —
 *   сделки сотрудника, разложенные по месяцу даты закрытия (CLOSEDATE).
 * Пайплайн из списка открытых сделок собирает finance-pipeline.assembler.
 */
import { roundMoney } from '@lib/shared/lib/deal-finance';
import type {
    ClosedSalesDealDto,
    ClosedSalesEmployeeDto,
    ClosedSalesTotalsDto,
} from '../../../sales-finance';
import type { MonthSegment } from '../../../shared/lib/month-segments.util';
import { emptyManagerPipeline } from './finance-pipeline.assembler';
import type {
    AiFinanceClosedTotals,
    AiFinanceManagerMonth,
    AiFinanceManagerPipeline,
    AiFinanceManagerSummary,
    AiFinanceMonth,
    AiFinanceSource,
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

/** Итоги сотрудника sales-finance → итоги AI (dealsCount = salesCount, без quantity). */
export function toClosedTotals(
    totals: ClosedSalesTotalsDto,
): AiFinanceClosedTotals {
    return {
        salesCount: totals.dealsCount,
        advanceAmount: totals.advanceAmount,
        paidMonths: totals.paidMonths,
        monthlyAmount: totals.monthlyAmount,
        expectedContractAmount: totals.expectedContractAmount,
    };
}

/** Вклад одной сделки в итоги (как addToTotals sales-finance). */
function dealTotals(deal: ClosedSalesDealDto): AiFinanceClosedTotals {
    return {
        salesCount: 1,
        advanceAmount: deal.advanceAmount,
        paidMonths: deal.paidMonths,
        monthlyAmount: deal.monthlyAmount,
        expectedContractAmount: deal.expectedContractAmount,
    };
}

const CLOSE_MONTH = /^(\d{4}-\d{2})-\d{2}/;

/**
 * Месяц даты закрытия сделки `yyyy-MM` по строке CLOSEDATE Bitrix (дата
 * портала в начале ISO-строки — та же, по которой фильтр `>=CLOSEDATE`
 * отобрал сделку в период); нераспознанная дата — null.
 */
export function closeMonthOf(closeDate: string): string | null {
    return CLOSE_MONTH.exec(closeDate)?.[1] ?? null;
}

/**
 * Помесячная разбивка закрытых продаж периода: сегмент × менеджер ростера
 * (нули без сделок), сделки — по месяцу CLOSEDATE. `cachedMonths` — месяцы,
 * которые sales-finance отдал из кэша (для журнала походов в Bitrix).
 * Сделка с нераспознанной датой закрытия в месяцы не попадает (в сводке
 * периода она есть — там итоги сотрудника из отчёта).
 */
export function splitClosedSalesByMonth(
    segments: readonly MonthSegment[],
    employees: readonly ClosedSalesEmployeeDto[],
    managerIds: readonly number[],
    cachedMonths: ReadonlySet<string> = new Set<string>(),
): AiFinanceMonth[] {
    const byManager = new Map(
        employees.map(employee => [employee.assignedId, employee]),
    );
    return segments.map(segment => {
        const managers: AiFinanceManagerMonth[] = managerIds.map(managerId => {
            const totals = emptyClosedTotals();
            for (const deal of byManager.get(managerId)?.deals ?? []) {
                if (closeMonthOf(deal.closeDate) === segment.month) {
                    addClosedTotals(totals, dealTotals(deal));
                }
            }
            return { managerId, ...totals };
        });
        const totals = emptyClosedTotals();
        managers.forEach(manager => addClosedTotals(totals, manager));
        return {
            month: segment.month,
            from: segment.from,
            to: segment.to,
            closed: segment.cacheable,
            fromCache: cachedMonths.has(segment.month),
            managers,
            totals,
        };
    });
}

/**
 * Сводка за период по каждому менеджеру ростера: итоги сотрудника из
 * отчёта sales-finance (без сделок — нули) + пайплайн + откуда числа.
 */
export function summarizeManagers(
    employees: readonly ClosedSalesEmployeeDto[],
    pipeline: readonly AiFinanceManagerPipeline[],
    managerIds: readonly number[],
    source?: AiFinanceSource,
): AiFinanceManagerSummary[] {
    const closedById = new Map(
        employees.map(employee => [
            employee.assignedId,
            toClosedTotals(employee),
        ]),
    );
    const pipelineById = new Map(pipeline.map(row => [row.managerId, row]));
    return managerIds.map(managerId => {
        const closed = closedById.get(managerId) ?? emptyClosedTotals();
        const live =
            pipelineById.get(managerId) ?? emptyManagerPipeline(managerId);
        return {
            ...closed,
            ...live,
            managerId,
            ...(source === undefined ? {} : { source: { ...source } }),
        };
    });
}
