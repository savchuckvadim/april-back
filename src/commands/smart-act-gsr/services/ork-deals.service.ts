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
import { PortalModel } from '@/modules/portal/services/portal.model';

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

    public async geGrouppedByComapny() {
        const { deals: openDeals, portal } =
            await this.dealQueryService.getOpenDealsWithPortal();

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

    public async getDealsWithEmptyOneOfContractPeriodFields() {
        const { deals: openDeals, portal } =
            await this.dealQueryService.getOpenDealsWithPortal();
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
        portal: PortalModel,
        assignedById?: string,
    ): Promise<IOrkDeals> {
        // const allDeals =
        //     await this.dealQueryService.getAllDealsByAssigned(assignedById);
        const openDeals =
            await this.dealQueryService.getOpenDealsByAssigned(assignedById);
        const preparedDeals =
            (openDeals?.map(deal =>
                this.getDealPreparedResult(deal, portal),
            ) as IOrkDeal[]) ?? [];
        // const successDeals =
        //     await this.dealQueryService.getSuccessDealsByAssigned(assignedById);
        // const failDeals =
        //     await this.dealQueryService.getFailDealsByAssigned(assignedById);

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
