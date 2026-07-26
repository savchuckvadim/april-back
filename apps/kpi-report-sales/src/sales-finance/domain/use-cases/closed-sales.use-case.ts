/**
 * Тяжёлый расчёт отчёта по закрытым продажам (выполняется в воркере очереди).
 *
 * Месячное партиционирование кэша: полные прошлые месяцы читаются из Redis
 * и не пересчитываются; текущий/неполные сегменты всегда считаются заново.
 * forceRefresh обходит чтение кэша, но всегда перезаписывает его (write-through).
 */
import { PBXService } from '@/modules/pbx';
import { SalesFinanceCacheService } from '../../cache/sales-finance-cache.service';
import {
    buildClosedMonthKey,
    buildClosedResultKey,
} from '../../cache/cache-key.util';
import {
    SALES_FINANCE_PAST_MONTH_TTL_SECONDS,
    SALES_FINANCE_RESULT_TTL_SECONDS,
} from '../../constants/sales-finance.const';
import {
    ClosedSalesDealDto,
    ClosedSalesReportDto,
} from '../../dto/closed-sales-response.dto';
import { ClosedSalesJobData } from '../../dto/sales-finance-job.dto';
import {
    aggregateClosedSales,
    buildClosedSalesDeal,
    dealCompanyId,
} from '../calc/closed-sales-calc';
import {
    MonthSegment,
    splitIntoMonthSegments,
} from '../../../shared/lib/month-segments.util';
import { SalesFinanceCompanyService } from '../services/sales-finance-company.service';
import { SalesFinanceDealQueryService } from '../services/sales-finance-deal-query.service';
import { SalesFinanceProductRowsService } from '../services/sales-finance-product-rows.service';

export class ClosedSalesUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly cache: SalesFinanceCacheService,
    ) {}

    async execute(jobData: ClosedSalesJobData): Promise<ClosedSalesReportDto> {
        const { domain, filters, forceRefresh } = jobData;
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);

        const dealQuery = new SalesFinanceDealQueryService(bitrix, portal);
        const productRows = new SalesFinanceProductRowsService(bitrix);
        const companies = new SalesFinanceCompanyService(bitrix);

        const segments = splitIntoMonthSegments(
            filters.dateFrom,
            filters.dateTo,
            new Date(),
        );

        const allDeals: ClosedSalesDealDto[] = [];
        for (const segment of segments) {
            const deals = await this.loadSegmentDeals(
                segment,
                jobData,
                dealQuery,
                productRows,
                companies,
                forceRefresh,
            );
            allDeals.push(...deals);
        }

        const { employees, totals } = aggregateClosedSales(allDeals);
        const report: ClosedSalesReportDto = {
            employees,
            totals,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
            generatedAt: new Date().toISOString(),
        };

        await this.cache.setJson(
            buildClosedResultKey(
                domain,
                filters.dateFrom,
                filters.dateTo,
                filters.assignedIds,
            ),
            report,
            SALES_FINANCE_RESULT_TTL_SECONDS,
        );

        return report;
    }

    /** Сделки одного месячного сегмента: из кэша либо из Bitrix. */
    private async loadSegmentDeals(
        segment: MonthSegment,
        jobData: ClosedSalesJobData,
        dealQuery: SalesFinanceDealQueryService,
        productRows: SalesFinanceProductRowsService,
        companies: SalesFinanceCompanyService,
        forceRefresh: boolean,
    ): Promise<ClosedSalesDealDto[]> {
        const { domain, filters } = jobData;
        const monthKey = buildClosedMonthKey(
            domain,
            segment.month,
            filters.assignedIds,
        );

        if (segment.cacheable && !forceRefresh) {
            const cached =
                await this.cache.getJson<ClosedSalesDealDto[]>(monthKey);
            if (cached) return cached;
        }

        const bxDeals = await dealQuery.getWonDealsByCloseDateRange(
            filters.assignedIds,
            segment.from,
            segment.to,
        );
        const uf = dealQuery.getUfFields();
        const rowsByDealId = await productRows.getRowsByDealIds(
            bxDeals.map(deal => Number(deal.ID)),
        );
        // Компании — до кэша сегмента: v2-сегменты уже содержат названия.
        const companyMap = await companies.getTitleMap(
            bxDeals.map(deal => dealCompanyId(deal) ?? 0),
        );

        const deals = bxDeals.map(deal =>
            buildClosedSalesDeal(
                deal,
                rowsByDealId.get(Number(deal.ID)) ?? [],
                uf,
                companyMap,
            ),
        );

        if (segment.cacheable) {
            await this.cache.setJson(
                monthKey,
                deals,
                SALES_FINANCE_PAST_MONTH_TTL_SECONDS,
            );
        }

        return deals;
    }
}
