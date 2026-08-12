import { Injectable } from '@nestjs/common';
import { IOrkDeal, OrkDealsService } from '../services/ork-deals.service';
import { PBXService } from '@/modules/pbx';
import { OrkActsProductRowsService } from '../services/product-rows/product-row.service';
import { IBXProductRowRow } from '@/modules/bitrix';
import { delay } from '@/shared';
import {
    ISmartActItemsByDealResult,
    SmartActGsrService,
} from '../services/smart/smart-act-gsr.service';
import { coefficientFromDealMeasureName } from '../services/smart/utils/deal-product-coefficient.util';

export interface IDealWithRows {
    deal: IOrkDeal;
    rows: IBXProductRowRow[];
    productQuantity: number;
    productCoefficient: number;
    smartItems: ISmartActItemsByDealResult;
}
const assignedById = ''; //221
const TEST_DEALS_COUNT_LIMIT = 10;
const WITH_DEALS_COUNTLIMIT = false;
// const assignedById = undefined;
@Injectable()
export class OrkActsUpdateUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly orkDealsService: OrkDealsService,
        private readonly smartActGsrService: SmartActGsrService,
    ) {}

    async execute(
        domain: string,
        dealId?: number,
    ): Promise<{
        dealsWithRows: IDealWithRows[];
    }> {
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        const deals = await this.orkDealsService.getDealService(
            domain,
            PortalModel,
            assignedById,
            dealId,
        );
        const productRowsService = new OrkActsProductRowsService(bitrix);

        /**
         * Ограничения для тестов
         *
         */

        const dealsItems = deals.openDeals.items;
        const openDeals = WITH_DEALS_COUNTLIMIT
            ? dealsItems.slice(0, TEST_DEALS_COUNT_LIMIT)
            : dealsItems;
        // const openDeals = deals.openDeals.items;
        const dealsWithRows: IDealWithRows[] = [];
        for (const deal of openDeals) {
            const dealWithRowsItem: IDealWithRows = {
                deal: deal,
                rows: [] as IBXProductRowRow[],
                productQuantity: 0,
                productCoefficient: 1, //12, 6, 3, 1
                smartItems: {
                    items: [],
                    count: 0,
                } as ISmartActItemsByDealResult,
            };
            const productRows = await productRowsService.getDealProductRows(
                Number(deal.deal.ID),
            );
            dealWithRowsItem.rows = productRows ?? [];
            dealWithRowsItem.productQuantity = Number(
                dealWithRowsItem.rows[0]?.quantity ?? 1,
            );
            dealWithRowsItem.productCoefficient =
                coefficientFromDealMeasureName(
                    dealWithRowsItem.rows[0]?.measureName,
                );

            const smartItems =
                await this.smartActGsrService.getSmartActItemsByDeal(
                    Number(deal.deal.ID),
                );
            dealWithRowsItem.smartItems = smartItems;
            await delay(2000); // 1 seconds

            dealsWithRows.push(dealWithRowsItem); // результат со смартами
        }
        return {
            dealsWithRows,
        };
    }
}
