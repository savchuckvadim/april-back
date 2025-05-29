import { Injectable } from '@nestjs/common';
import { BitrixOwnerTypeId, BitrixService, IBXDeal } from 'src/modules/bitrix/';
import { PortalService } from 'src/modules/portal';
import { GetDealsDto, ReplaceDealsDto } from './dto/get-deals.dto';
import { PBXService } from 'src/modules/pbx/pbx.servise';
@Injectable()
export class ChangeDealCategoryService {
    private bitrix: BitrixService

    constructor(

        private readonly pbx: PBXService
    ) { }

    async getDeals(dto: GetDealsDto) {
        const { bitrix, portal, PortalModel } = await this.pbx.init(dto.domain);
        this.bitrix = bitrix

        let more = true

        const deals: IBXDeal[] = []
        let startId = 0
        let totalBx = 0
        const nexts: number[] = []
        while (more) {

            const response = await this.bitrix.deal.getList(
                {
                    STAGE_ID: `C${dto.categoryId}:${dto.stageId}`,
                    CATEGORY_ID: dto.categoryId,
                    // ASSIGNED_BY_ID: '502',
                    ">ID": startId
                },
                ['ID', 'TITLE', 'STAGE_ID', 'CATEGORY_ID', 'ASSIGNED_BY_ID'],
                {
                    'ID': 'ASC'
                }
            )
            if (!totalBx) {
                totalBx = response.total
            }

            deals.push(...response.result)
            more = response.next ? true : false
            startId = response.result[response.result.length - 1]?.ID
            nexts.push(response.next)
        }
        return {
            deals,
            totalBx,
            totalDeals: deals.length,
            nexts
        }
    }

    async replaceDeals(dto: ReplaceDealsDto) {
        const dealsData = await this.getDeals({
            domain: dto.domain,
            categoryId: dto.fromCategoryId,
            stageId: dto.fromStageId
        })

        const deals = dealsData.deals

        deals.forEach(deal => {
            this.bitrix.batch.item.update(
                `update_deal_${deal.ID}`,
                deal.ID,
                BitrixOwnerTypeId.DEAL,
                {

                    stageId: `C${dto.toCategoryId}:${dto.toStageId}`,
                    categoryId: dto.toCategoryId
                })
        })
        const result = await this.bitrix.api.callBatchWithConcurrency(1)
        return {
            deals,
            cmds: this.bitrix.api.getCmdBatch(),
            totalDeals: deals.length,
            result: result.length
        }


    }



    async getDealsBtch(dto: GetDealsDto) {
        const { bitrix } = await this.pbx.init(dto.domain);
        this.bitrix = bitrix

        let startId = 0 as number | string


        const response = await this.bitrix.deal.getList(
            {
                STAGE_ID: `C${dto.categoryId}:${dto.stageId}`,
                CATEGORY_ID: dto.categoryId,
                // ASSIGNED_BY_ID: '502'

            },
            ['ID', 'TITLE', 'STAGE_ID', 'CATEGORY_ID', 'ASSIGNED_BY_ID'],
            {
                'ID': 'DESC'
            }
        )
        startId = response.result[response.result.length - 1].ID
        const batchesCount = Math.ceil(response.total / 50)
        const batches = []
        for (let i = 0; i < batchesCount; i++) {
            bitrix.batch.deal.getList(
                `get_deal_list_${i}`,
                {
                    STAGE_ID: `C${dto.categoryId}:${dto.stageId}`,
                    CATEGORY_ID: dto.categoryId,
                    // ASSIGNED_BY_ID: '502'
                    "<ID": startId
                },
                ['ID', 'TITLE', 'STAGE_ID', 'CATEGORY_ID', 'ASSIGNED_BY_ID'],
                {
                    'ID': 'DESC'
                }
            )
            startId = `get_deal_list_${i}[0].ID`
        }
        const responses = await bitrix.api.callBatchWithConcurrency(3)
        // const clearedResponses = bitrix.api.clearResult(responses)
        // const deals: IBXDeal[] = []
        // clearedResponses.map(response => response.map((deal: IBXDeal) => {
        //     deals.push(deal)
        // }))

        // }
        return {
            deals: responses,
            totalDeals: responses.length,

        }
    }

}