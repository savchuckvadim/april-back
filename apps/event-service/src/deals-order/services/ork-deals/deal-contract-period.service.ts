import { IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { Injectable } from '@nestjs/common';
import { getContractPeriodDealValue } from './utils/get-contract-period-field.util';

@Injectable()
export class DealContractPeriodService {
    public getDealsWithEmptyFrom(deals: IBXDeal[], portal: PortalModel) {
        return deals.filter((deal: IBXDeal) => {
            return getContractPeriodDealValue(deal, portal, 'start') === '';
        });
    }

    public getDealsWithEmptyTo(deals: IBXDeal[], portal: PortalModel) {
        return deals.filter((deal: IBXDeal) => {
            return getContractPeriodDealValue(deal, portal, 'end') === '';
        });
    }

    public getDuplicateContractMonthsByField(
        deals: IBXDeal[],
        portal: PortalModel,
        type: 'start' | 'end',
    ): string[] {
        const monthCounter: Record<string, number> = {};

        for (const deal of deals) {
            const value =
                (getContractPeriodDealValue(deal, portal, type) as
                    | string
                    | undefined) ?? '';
            const month = this.extractYearMonth(value);
            if (!month) continue;
            monthCounter[month] = (monthCounter[month] ?? 0) + 1;
        }

        const duplicateMonths: string[] = [];
        for (const [month, count] of Object.entries(monthCounter)) {
            if (count > 1) {
                duplicateMonths.push(month);
            }
        }
        return duplicateMonths;
    }

    private extractYearMonth(value: string): string {
        if (!value) {
            return '';
        }

        return value.slice(0, 7);
    }
}
