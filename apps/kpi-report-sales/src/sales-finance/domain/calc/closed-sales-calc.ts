/**
 * Чистые расчёты финансовых показателей закрытых продаж.
 * Математика строк — libs/shared (deal-finance), месяцы договора — libs/shared (date).
 */
import { IBXDeal } from '@/modules/bitrix';
import { IBXProductRowRow } from '@/modules/bitrix/domain/crm/product-row/interface/bx-product-row.interface';
import { countContractMonths, parseContractDate } from '@lib/shared/lib/date';
import { CompanyInfo } from '../services/sales-finance-company.service';
import {
    roundMoney,
    sumRowsMonthly,
    sumRowsMonths,
    sumRowsQuantity,
    sumRowsTotal,
} from '@lib/shared/lib/deal-finance';
import {
    ClosedSalesDealDto,
    ClosedSalesEmployeeDto,
    ClosedSalesTotalsDto,
} from '../../dto/closed-sales-response.dto';
import { SalesFinanceUfFields } from '../services/sales-finance-deal-query.service';

function toIsoOrNull(value: unknown): string | null {
    const date = parseContractDate(value);
    return date ? date.toISOString() : null;
}

/** COMPANY_ID сделки: Bitrix отдаёт '0'/пусто при отсутствии → null. */
export function dealCompanyId(deal: IBXDeal): number | null {
    const id = Number(deal.COMPANY_ID ?? 0);
    return id > 0 ? id : null;
}

/** Финансовые показатели одной закрытой сделки из её товарных строк. */
export function buildClosedSalesDeal(
    deal: IBXDeal,
    rows: IBXProductRowRow[],
    uf: SalesFinanceUfFields,
    companyMap: Map<number, CompanyInfo>,
): ClosedSalesDealDto {
    const contractStartDate = parseContractDate(deal[uf.contractStart]);
    const contractEndDate = parseContractDate(deal[uf.contractEnd]);
    const contractMonths =
        contractStartDate && contractEndDate
            ? countContractMonths(contractStartDate, contractEndDate)
            : 0;

    const monthlyAmount = sumRowsMonthly(rows);
    const companyId = dealCompanyId(deal);
    const company = companyId !== null ? companyMap.get(companyId) : undefined;

    return {
        id: Number(deal.ID),
        title: String(deal.TITLE ?? ''),
        assignedId: Number(deal.ASSIGNED_BY_ID ?? 0),
        closeDate: String(deal.CLOSEDATE ?? ''),
        opportunity: Number(deal.OPPORTUNITY ?? 0),
        advanceAmount: sumRowsTotal(rows),
        paidMonths: sumRowsMonths(rows),
        monthlyAmount,
        quantity: sumRowsQuantity(rows),
        contractStart: toIsoOrNull(deal[uf.contractStart]),
        contractEnd: toIsoOrNull(deal[uf.contractEnd]),
        contractMonths,
        expectedContractAmount: roundMoney(monthlyAmount * contractMonths),
        companyId,
        companyName: company?.title ?? null,
        companyColor: company?.color ?? null,
    };
}

function emptyTotals(): ClosedSalesTotalsDto {
    return {
        dealsCount: 0,
        advanceAmount: 0,
        paidMonths: 0,
        monthlyAmount: 0,
        quantity: 0,
        expectedContractAmount: 0,
    };
}

function addToTotals(
    totals: ClosedSalesTotalsDto,
    deal: ClosedSalesDealDto,
): void {
    totals.dealsCount += 1;
    totals.advanceAmount = roundMoney(
        totals.advanceAmount + deal.advanceAmount,
    );
    totals.paidMonths += deal.paidMonths;
    totals.monthlyAmount = roundMoney(
        totals.monthlyAmount + deal.monthlyAmount,
    );
    totals.quantity += deal.quantity;
    totals.expectedContractAmount = roundMoney(
        totals.expectedContractAmount + deal.expectedContractAmount,
    );
}

/** Агрегация сделок по сотрудникам + общие итоги. */
export function aggregateClosedSales(deals: ClosedSalesDealDto[]): {
    employees: ClosedSalesEmployeeDto[];
    totals: ClosedSalesTotalsDto;
} {
    const totals = emptyTotals();
    const byEmployee = new Map<number, ClosedSalesEmployeeDto>();

    for (const deal of deals) {
        addToTotals(totals, deal);

        let employee = byEmployee.get(deal.assignedId);
        if (!employee) {
            employee = {
                ...emptyTotals(),
                assignedId: deal.assignedId,
                deals: [],
            };
            byEmployee.set(deal.assignedId, employee);
        }
        addToTotals(employee, deal);
        employee.deals.push(deal);
    }

    return {
        employees: [...byEmployee.values()].sort(
            (a, b) => a.assignedId - b.assignedId,
        ),
        totals,
    };
}
