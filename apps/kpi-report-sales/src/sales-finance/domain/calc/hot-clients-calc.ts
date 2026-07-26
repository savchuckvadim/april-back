/**
 * Чистые расчёты списка горячих клиентов (открытые сделки).
 */
import { IBXDeal } from '@/modules/bitrix';
import { IBXProductRowRow } from '@/modules/bitrix/domain/crm/product-row/interface/bx-product-row.interface';
import {
    roundMoney,
    sumRowsMonthly,
    sumRowsTotal,
} from '@lib/shared/lib/deal-finance';
import {
    HotClientDealDto,
    HotClientsTotalsDto,
} from '../../dto/hot-clients-response.dto';
import { SalesFinanceUfFields } from '../services/sales-finance-deal-query.service';
import { CompanyInfo } from '../services/sales-finance-company.service';
import { dealCompanyId } from './closed-sales-calc';

/** Multiple-поля Bitrix приходят массивом, но страхуемся от строки. */
function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map(String).filter(item => item.length > 0);
    }
    if (typeof value === 'string' && value.length > 0) return [value];
    return [];
}

export function buildHotClientDeal(
    deal: IBXDeal,
    rows: IBXProductRowRow[],
    stageInfo: { code: string; name: string } | undefined,
    uf: SalesFinanceUfFields,
    companyMap: Map<number, CompanyInfo>,
): HotClientDealDto {
    const companyId = dealCompanyId(deal);
    const company = companyId !== null ? companyMap.get(companyId) : undefined;
    return {
        id: Number(deal.ID),
        title: String(deal.TITLE ?? ''),
        assignedId: Number(deal.ASSIGNED_BY_ID ?? 0),
        stageCode: stageInfo?.code ?? String(deal.STAGE_ID ?? ''),
        stageName: stageInfo?.name ?? '',
        opportunity: Number(deal.OPPORTUNITY ?? 0),
        productRowsAmount: sumRowsTotal(rows),
        monthlyAmount: sumRowsMonthly(rows),
        opHistory: toStringArray(deal[uf.opHistory]),
        comments: toStringArray(deal[uf.presComments]),
        companyId,
        companyName: company?.title ?? null,
        companyColor: company?.color ?? null,
    };
}

export function buildHotClientsTotals(
    deals: HotClientDealDto[],
): HotClientsTotalsDto {
    return deals.reduce<HotClientsTotalsDto>(
        (totals, deal) => ({
            dealsCount: totals.dealsCount + 1,
            opportunityTotal: roundMoney(
                totals.opportunityTotal + deal.opportunity,
            ),
            productRowsAmountTotal: roundMoney(
                totals.productRowsAmountTotal + deal.productRowsAmount,
            ),
            monthlyAmountTotal: roundMoney(
                totals.monthlyAmountTotal + deal.monthlyAmount,
            ),
        }),
        {
            dealsCount: 0,
            opportunityTotal: 0,
            productRowsAmountTotal: 0,
            monthlyAmountTotal: 0,
        },
    );
}
