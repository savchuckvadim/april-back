import { IBXDeal } from '@/modules/bitrix';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DealGroupingService {
    public getDealsGrouppedByComapny(
        deals: IBXDeal[],
    ): Record<string, IBXDeal[]> {
        const groupped = deals.reduce(
            (acc: Record<string, IBXDeal[]>, deal: IBXDeal) => {
                acc[deal.COMPANY_ID] =
                    acc[deal.COMPANY_ID] || ([] as IBXDeal[]);
                acc[deal.COMPANY_ID].push(deal);
                return acc;
            },
            {} as Record<string, IBXDeal[]>,
        );

        return Object.fromEntries(
            Object.entries(groupped).filter(([, companyDeals]) => {
                return companyDeals.length > 1;
            }),
        ) as Record<string, IBXDeal[]>;
    }
}
