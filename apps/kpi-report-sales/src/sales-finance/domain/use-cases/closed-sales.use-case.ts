/**
 * Тяжёлый расчёт отчёта по закрытым продажам (выполняется в воркере очереди).
 *
 * Месячное партиционирование кэша: полный прошлый месяц хранится ОДИН на
 * домен — все выигранные сделки воронки за месяц, отбор ответственных
 * делается в памяти после чтения. Поэтому страница сотрудника, команда и
 * AI-аналитика видят одни и те же сделки месяца, а сделка, закрытая задним
 * числом или переданная другому ответственному, не «застревает» в ячейке
 * чужого состава. Последние закрытые месяцы живут сутки, старше — 30 дней
 * (closed-month-ttl.util). Текущий/неполные сегменты всегда считаются
 * заново запросом по сотрудникам. forceRefresh обходит чтение кэша, но
 * всегда перезаписывает его (write-through).
 */
import { PBXService } from '@/modules/pbx';
import { SalesFinanceCacheService } from '../../cache/sales-finance-cache.service';
import {
    buildClosedMonthKey,
    buildClosedResultKey,
} from '../../cache/cache-key.util';
import { closedMonthTtlSeconds } from '../../cache/closed-month-ttl.util';
import { SALES_FINANCE_RESULT_TTL_SECONDS } from '../../constants/sales-finance.const';
import {
    ClosedSalesDealDto,
    ClosedSalesReportDto,
} from '../../dto/closed-sales-response.dto';
import { ClosedSalesJobData } from '../../dto/sales-finance-job.dto';
import {
    aggregateClosedSales,
    buildClosedSalesDeal,
    ContractTypeDictItem,
    dealCompanyId,
    filterDealsByAssignees,
} from '../calc/closed-sales-calc';
import {
    ContractTypeItemsService,
    mergeContractTypeItems,
} from '../services/contract-type-items.service';
import { PBX_SALES_KONSTRUCTOR_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import {
    IsoMonth,
    MonthSegment,
    splitIntoMonthSegments,
} from '../../../shared/lib/month-segments.util';
import { SalesFinanceCompanyService } from '../services/sales-finance-company.service';
import { SalesFinanceDealQueryService } from '../services/sales-finance-deal-query.service';
import { SalesFinanceProductRowsService } from '../services/sales-finance-product-rows.service';

/** Отчёт + какие месяцы пришли из кэша (для журналов потребителей). */
export interface ClosedSalesExecution {
    report: ClosedSalesReportDto;
    /** Закрытые месяцы, взятые из кэша домена: Bitrix для них не вызывался. */
    cachedMonths: IsoMonth[];
}

/** Per-request сервисы расчёта сегмента (bitrix — из pbx.init(domain)). */
interface SegmentServices {
    dealQuery: SalesFinanceDealQueryService;
    productRows: SalesFinanceProductRowsService;
    companies: SalesFinanceCompanyService;
    contractTypeItems: ReadonlyMap<number, ContractTypeDictItem>;
}

/** Сделки сегмента после отбора ответственных. */
interface SegmentDeals {
    deals: ClosedSalesDealDto[];
    fromCache: boolean;
}

export class ClosedSalesUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly cache: SalesFinanceCacheService,
    ) {}

    async execute(jobData: ClosedSalesJobData): Promise<ClosedSalesReportDto> {
        return (await this.executeDetailed(jobData)).report;
    }

    /** Отчёт и признак «месяц из кэша» по сегментам (AI-аналитика). */
    async executeDetailed(
        jobData: ClosedSalesJobData,
    ): Promise<ClosedSalesExecution> {
        const { domain, filters, forceRefresh } = jobData;
        const services = await this.createServices(domain, forceRefresh);
        const now = new Date();
        const segments = splitIntoMonthSegments(
            filters.dateFrom,
            filters.dateTo,
            now,
        );

        const allDeals: ClosedSalesDealDto[] = [];
        const cachedMonths: IsoMonth[] = [];
        for (const segment of segments) {
            const loaded = await this.loadSegmentDeals(
                segment,
                jobData,
                services,
                now,
            );
            allDeals.push(...loaded.deals);
            if (loaded.fromCache) cachedMonths.push(segment.month);
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

        return { report, cachedMonths };
    }

    /** Сервисы расчёта на один прогон: bitrix и портал — per-domain. */
    private async createServices(
        domain: string,
        forceRefresh: boolean,
    ): Promise<SegmentServices> {
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);
        const dealQuery = new SalesFinanceDealQueryService(bitrix, portal);
        // Словарь типов договора — один на весь пересчёт: портальные items
        // (семантические коды) + живой список (свежие имена, ручные элементы).
        const contractTypeItems = ContractTypeItemsService.byId(
            mergeContractTypeItems(
                portal.getDealFieldByCode(
                    PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type,
                )?.items ?? [],
                await new ContractTypeItemsService(
                    bitrix,
                    this.cache,
                    domain,
                ).getItems(dealQuery.getUfFields().contractType, forceRefresh),
            ),
        );
        return {
            dealQuery,
            productRows: new SalesFinanceProductRowsService(
                bitrix,
                this.cache,
                domain,
            ),
            companies: new SalesFinanceCompanyService(bitrix, portal),
            contractTypeItems,
        };
    }

    /**
     * Сделки сегмента по сотрудникам фильтра. Закрытый месяц — общая ячейка
     * домена (из кэша либо все сделки месяца из Bitrix с записью), отбор
     * ответственных в памяти; живой/неполный сегмент — запрос по сотрудникам.
     */
    private async loadSegmentDeals(
        segment: MonthSegment,
        jobData: ClosedSalesJobData,
        services: SegmentServices,
        now: Date,
    ): Promise<SegmentDeals> {
        const { domain, filters, forceRefresh } = jobData;
        if (!segment.cacheable) {
            return {
                deals: await this.fetchDeals(
                    segment,
                    services,
                    filters.assignedIds,
                ),
                fromCache: false,
            };
        }

        const monthKey = buildClosedMonthKey(domain, segment.month);
        if (!forceRefresh) {
            const cached =
                await this.cache.getJson<ClosedSalesDealDto[]>(monthKey);
            if (cached) {
                return {
                    deals: filterDealsByAssignees(cached, filters.assignedIds),
                    fromCache: true,
                };
            }
        }

        const monthDeals = await this.fetchDeals(segment, services);
        await this.cache.setJson(
            monthKey,
            monthDeals,
            closedMonthTtlSeconds(segment.month, now),
        );
        return {
            deals: filterDealsByAssignees(monthDeals, filters.assignedIds),
            fromCache: false,
        };
    }

    /** Выигранные сделки сегмента из Bitrix (без сотрудников — все). */
    private async fetchDeals(
        segment: MonthSegment,
        services: SegmentServices,
        assignedIds?: readonly number[],
    ): Promise<ClosedSalesDealDto[]> {
        const { dealQuery, productRows, companies, contractTypeItems } =
            services;
        const bxDeals = await dealQuery.getWonDealsByCloseDateRange(
            segment.from,
            segment.to,
            assignedIds,
        );
        const uf = dealQuery.getUfFields();
        // Строки — из промежуточного кэша per-сделка (версия DATE_MODIFY):
        // повторный пересчёт тянет только изменённые/новые сделки.
        const rowsByDealId = await productRows.getRowsByDeals(
            bxDeals.map(deal => ({
                id: Number(deal.ID),
                dateModify: String(deal.DATE_MODIFY ?? ''),
            })),
        );
        // Компании — до кэша сегмента: сегменты уже содержат название+цвет.
        const companyMap = await companies.getInfoMap(
            bxDeals.map(deal => dealCompanyId(deal) ?? 0),
        );

        return bxDeals.map(deal =>
            buildClosedSalesDeal(
                deal,
                rowsByDealId.get(Number(deal.ID)) ?? [],
                uf,
                companyMap,
                contractTypeItems,
            ),
        );
    }
}
