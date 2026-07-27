/**
 * Расчёт списка горячих клиентов (выполняется в воркере очереди).
 * Живое состояние воронки — кэшируется только коротко (result-ключ).
 */
import { PBXService } from '@/modules/pbx';
import { SalesFinanceCacheService } from '../../cache/sales-finance-cache.service';
import { buildHotClientsKey } from '../../cache/cache-key.util';
import { SALES_FINANCE_RESULT_TTL_SECONDS } from '../../constants/sales-finance.const';
import { HotClientsReportDto } from '../../dto/hot-clients-response.dto';
import { HotClientsJobData } from '../../dto/sales-finance-job.dto';
import {
    buildHotClientDeal,
    buildHotClientsTotals,
} from '../calc/hot-clients-calc';
import { resolveStageIdsFromThreshold } from '../calc/stage-threshold.util';
import { dealCompanyId } from '../calc/closed-sales-calc';
import { SalesFinanceCompanyService } from '../services/sales-finance-company.service';
import { SalesFinanceDealQueryService } from '../services/sales-finance-deal-query.service';
import { SalesFinanceProductRowsService } from '../services/sales-finance-product-rows.service';
import { ContractTypeItemsService } from '../services/contract-type-items.service';

export class HotClientsUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly cache: SalesFinanceCacheService,
    ) {}

    async execute(jobData: HotClientsJobData): Promise<HotClientsReportDto> {
        const { domain, threshold, assignedIds, forceRefresh } = jobData;
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);

        const dealQuery = new SalesFinanceDealQueryService(bitrix, portal);
        const productRows = new SalesFinanceProductRowsService(
            bitrix,
            this.cache,
            domain,
        );

        const category = dealQuery.getSalesBaseCategory();
        const { stageIds, stageByStageId } = resolveStageIdsFromThreshold(
            category,
            threshold,
        );

        const bxDeals = await dealQuery.getOpenDealsByStageIds(
            stageIds,
            assignedIds,
        );
        const uf = dealQuery.getUfFields();
        // Живой словарь типов договора (включая ручные элементы портала).
        const contractTypeItems = ContractTypeItemsService.byId(
            await new ContractTypeItemsService(
                bitrix,
                this.cache,
                domain,
            ).getItems(uf.contractType, forceRefresh),
        );
        // Строки — из промежуточного кэша per-сделка (версия DATE_MODIFY).
        const rowsByDealId = await productRows.getRowsByDeals(
            bxDeals.map(deal => ({
                id: Number(deal.ID),
                dateModify: String(deal.DATE_MODIFY ?? ''),
            })),
        );
        const companyMap = await new SalesFinanceCompanyService(
            bitrix,
            portal,
        ).getInfoMap(bxDeals.map(deal => dealCompanyId(deal) ?? 0));

        const deals = bxDeals.map(deal =>
            buildHotClientDeal(
                deal,
                rowsByDealId.get(Number(deal.ID)) ?? [],
                stageByStageId.get(String(deal.STAGE_ID ?? '')),
                uf,
                companyMap,
                contractTypeItems,
            ),
        );

        const report: HotClientsReportDto = {
            deals,
            totals: buildHotClientsTotals(deals),
            threshold,
            generatedAt: new Date().toISOString(),
        };

        await this.cache.setJson(
            buildHotClientsKey(domain, threshold, assignedIds),
            report,
            SALES_FINANCE_RESULT_TTL_SECONDS,
        );

        return report;
    }
}
