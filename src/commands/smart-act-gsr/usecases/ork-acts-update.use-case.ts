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

export interface IDealWithRows {
    deal: IOrkDeal;
    rows: IBXProductRowRow[];
    productQuantity: number;
    productCoefficient: number;
    smartItems: ISmartActItemsByDealResult;
}

/**
 * - берет все сделки
 * - с кждой сделкой делает:
 *  - берет продукты  (у них есть количество)
 *  - берет смарты (у них есть количество)
 |всего количество месяцев по договору| прошло полных месяцев |  осталось месяцев | всего количество товаров | всего количество смарт * количество |
|--------------------------------     |-----------------------|-------------------|--------------------------|-------------------------------      |---------|
| 12                                  | 3                     | 9                 |3                         | 0                                | 100     |
|--------------------------------     |-----------------------|-------------------|--------------------------|-------------------------------      |---------|

основные паттерны
общее количество месяцев по договору - истина. стнадартно 12 но может быть сколько угодно
менеджер может изменить количсевто месяецев (в большую сторону - продлить) в меньшую сторону - был отказ. причем отказ может быть задним числоим

Отказ задним числом, или сделка актуальной была давно -  количество месяцев по договору < прошло полных месяцев

*/

@Injectable()
export class OrkActsUpdateUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly orkDealsService: OrkDealsService,
        private readonly smartActGsrService: SmartActGsrService,
    ) {}

    async execute(): Promise<{
        dealsWithRows: IDealWithRows[];
    }> {
        const { bitrix, PortalModel } = await this.pbx.init('gsr.bitrix24.ru');
        const deals = await this.orkDealsService.getDealService(
            PortalModel,
            '187',
        );
        const productRowsService = new OrkActsProductRowsService(bitrix);
        const openDeals = deals.openDeals.items.filter(
            (d, index) => index < 10,
        );

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
            dealWithRowsItem.productCoefficient = this.getProductCoefficient(
                dealWithRowsItem.rows[0]?.measureName,
            );

            await delay(3000); // 3 seconds

            const smartItems =
                await this.smartActGsrService.getSmartActItemsByDeal(
                    Number(deal.deal.ID),
                );
            dealWithRowsItem.smartItems = smartItems;
            await delay(3000); // 3 seconds

            dealsWithRows.push(dealWithRowsItem); // результат со смартами
        }

        // const testSmartsItems =
        //     await this.smartActGsrService.getSmartActItemsByDeal(139099);
        // console.log('testSmartsItems', testSmartsItems);
        // const createdSmartAct =
        //     await this.createSmartActGsrService.createSmartActGsr({
        //         dealId: 139099,
        //         productQuantity: 1,
        //         productCoefficient: 1,
        //         smartItems: testSmartsItems,
        //         from: '2026-01-01',
        //         to: '2026-12-31',
        //         quantity: 1,
        //     });
        // console.log('createdSmartAct', createdSmartAct);
        return {
            // deals,
            dealsWithRows,
            // testSmartsItems,
            // productRows: (productRows?.result as IBXProductRowRow[]) ?? [],
        };
    }

    private getProductCoefficient(measureName: string | undefined): number {
        if (measureName?.includes('12')) {
            return 12;
        } else if (measureName?.includes('6')) {
            return 6;
        } else if (measureName?.includes('3')) {
            return 3;
        }
        return 1; //default
    }
}
