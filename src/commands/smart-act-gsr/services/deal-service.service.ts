import { Injectable } from '@nestjs/common';
import {
    DealContractPeriodService,
    DealGroupingService,
    DealQueryService,
} from './index';

@Injectable()
export class DealServiceService {
    constructor(
        private readonly dealQueryService: DealQueryService,
        private readonly dealGroupingService: DealGroupingService,
        private readonly dealContractPeriodService: DealContractPeriodService,
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

    public async getDealService() {
        const assignedById = '187';
        const allDeals =
            await this.dealQueryService.getAllDealsByAssigned(assignedById);
        const openDeals =
            await this.dealQueryService.getOpenDealsByAssigned(assignedById);
        const successDeals =
            await this.dealQueryService.getSuccessDealsByAssigned(assignedById);
        const failDeals = await this.dealQueryService.getFailDeals();

        //    const chat =  await bitrix.dialog.chatGet()
        return {
            allDeals: {
                count: allDeals?.length ?? 0,
                items: allDeals ?? [],
            },
            openDeals: {
                count: openDeals?.length ?? 0,
                items: openDeals ?? [],
            },
            successDeals: {
                count: successDeals?.length ?? 0,
                items: successDeals ?? [],
            },
            failDeals: {
                count: failDeals?.length ?? 0,
                items: failDeals ?? [],
            },
        };
    }
}
