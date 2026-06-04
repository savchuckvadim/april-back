import { Injectable } from '@nestjs/common';
import {
    DealContractPeriodService,
    DealGroupingService,
    DealQueryService,
} from './index';
import { IBXDeal } from '@/modules/bitrix';
import {
    DealPerodDataService,
    IOrkDealPeriodData,
} from './ork-deals/deal-perod-data.service';
import { PortalModel } from '@lib/portal/services/portal.model';
import { delay } from '@/shared';

export interface IOrkDeal {
    deal: IBXDeal;
    periodData: IOrkDealPeriodData;
}
export interface IOrkDealsResult {
    count: number;
    items: IOrkDeal[];
}
export interface IOrkDeals {
    openDeals: IOrkDealsResult;
    // successDeals: IOrkDealsResult;
    // failDeals: IOrkDealsResult;
}
@Injectable()
export class OrkDealsService {
    constructor(
        private readonly dealQueryService: DealQueryService,
        private readonly dealGroupingService: DealGroupingService,
        private readonly dealContractPeriodService: DealContractPeriodService,
        private readonly dealPerodDataService: DealPerodDataService,
    ) {}

    public async geGrouppedByComapny(domain: string) {
        const { deals: openDeals, portal } =
            await this.dealQueryService.getOpenDealsWithPortal(domain);

        const groupped = this.dealGroupingService.getDealsGrouppedByComapny(
            openDeals ?? [],
        );
        const warnings = Object.entries(groupped).map(
            ([companyId, companyDeals]) => {
                const duplicateStartMonths =
                    this.dealContractPeriodService.getDuplicateContractMonthsByField(
                        companyDeals,
                        portal,
                        'start',
                    );
                const duplicateEndMonths =
                    this.dealContractPeriodService.getDuplicateContractMonthsByField(
                        companyDeals,
                        portal,
                        'end',
                    );

                return {
                    companyId,
                    companyTitle: '' as string,
                    duplicateStartMonths,
                    duplicateEndMonths,
                    deals: companyDeals,
                };
            },
        );
        return {
            count: Object.keys(groupped).length,
            items: groupped,
            warnings,
        };
    }

    public async getDealsWithEmptyOneOfContractPeriodFields(domain: string) {
        const { deals: openDeals, portal } =
            await this.dealQueryService.getOpenDealsWithPortal(domain);
        const dealsWithEmptyFrom =
            this.dealContractPeriodService.getDealsWithEmptyFrom(
                openDeals ?? [],
                portal,
            );
        const dealsWithEmptyTo =
            this.dealContractPeriodService.getDealsWithEmptyTo(
                openDeals ?? [],
                portal,
            );
        return { dealsWithEmptyFrom, dealsWithEmptyTo };
    }

    public async getDealService(
        domain: string,
        portal: PortalModel,
        assignedById?: string,
        dealId?: number,
    ): Promise<IOrkDeals> {
        // console.log('getting all deals by assigned by id', assignedById);
        // const openDeals = await this.dealQueryService.getAllDealsByAssigned(
        //     assignedById,
        //     dealId,
        // );
        console.log('getting fail deals by assigned by id', assignedById);
        const failDeals = await this.dealQueryService.getFailDealsByAssigned(
            domain,
            assignedById,
            dealId,
        );
        await delay(2000);
        console.log('getting open deals by assigned by id', assignedById);
        const openDeals = await this.dealQueryService.getOpenDealsByAssigned(
            domain,
            assignedById,
            dealId,
        );
        const deals = [...(failDeals ?? []), ...(openDeals ?? [])];
        const preparedDeals = deals.map(deal =>
            this.getDealPreparedResult(deal, portal),
        );
        // const successDeals =
        //     await this.dealQueryService.getSuccessDealsByAssigned(assignedById);
        console.log('preparedDeals', preparedDeals);
        const preparedOpenDealsCount = preparedDeals?.length;
        console.log('preparedOpenDealsCount', preparedOpenDealsCount);
        return {
            // allDeals: {
            //     count: allDeals?.length ?? 0,
            //     items: allDeals ?? [],
            // },
            openDeals: {
                count: preparedDeals?.length ?? 0,
                items: preparedDeals ?? [],
            },
            // successDeals: {
            //     count: successDeals?.length ?? 0,
            //     items: successDeals ?? [],
            // },
            // failDeals: {
            //     count: failDeals?.length ?? 0,
            //     items: failDeals ?? [],
            // },
        };
    }
    private getDealPreparedResult(
        deal: IBXDeal,
        portal: PortalModel,
    ): IOrkDeal {
        const periodData = this.dealPerodDataService.getDealPeriodData(
            deal,
            portal,
        );
        return {
            deal,
            periodData,
        };
    }
}
