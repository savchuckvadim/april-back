import { Injectable } from "@nestjs/common";
import { PBXService } from "@/modules/pbx";
import { BxSmartService } from "../services/bx-smart.service";
import { AddSmartItemDto, CategoryId, StageId } from "../dto/smart-item.dto";
import { IAlfaParticipantSmartItem } from "../bx-data/bx-smart-data";

@Injectable()
export class SmartUseCase {
    constructor(
        private readonly pbx: PBXService
    ) { }

    public async getList(entityTypeId: string, domain: string) {
        const { bitrix } = await this.pbx.init(domain)
        const smartsService = new BxSmartService()
        await smartsService.init(bitrix)
        const smarts = await smartsService.getList(entityTypeId);
        return smarts;
    }

    public async add(body: AddSmartItemDto, domain: string, categoryId: CategoryId, stageId: StageId) {
        const { bitrix } = await this.pbx.init(domain)
        const smartsService = new BxSmartService()
        await smartsService.init(bitrix)
        const item = {
            ...body.item,
            stageId: `DT${body.entityTypeId}_${categoryId}:${stageId}`
        } as IAlfaParticipantSmartItem<1036, 26, StageId>;

        console.log(item);
        const smarts = await smartsService.add(body.entityTypeId, item);
        return smarts;
    }
}