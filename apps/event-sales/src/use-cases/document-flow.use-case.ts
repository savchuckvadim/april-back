import { Injectable } from '@nestjs/common';
// import {
//     BitrixDealService,
//     BitrixDealBatchFlowService,
// } from '../shared/deal-flow';
import { IBXDeal } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import { BitrixDealService } from '../shared';

interface EventDocumentFlowDto {
    domain: string;
    isFromPresentation: boolean;
    isSupplyReport: boolean;
    userId: string;

    presentation: IBXDeal | null;
    companyId: string | null;
    dealId: string | null;
}

@Injectable()
export class EventDocumentFlowUseCase {
    constructor(private readonly pbx: PBXService) {}

    async flow(dto: EventDocumentFlowDto): Promise<boolean> {
        const { bitrix, PortalModel } = await this.pbx.init(dto.domain);
        const portal = PortalModel.getPortal();
        const dealService = new BitrixDealService(bitrix);
        // const entityService = new BitrixEntityFlowService(bitrix);
        console.log('dealService', dealService);
        // console.log('entityService', entityService);
        console.log('portal', portal);
        // const listService = new BitrixListService(bitrix, portal)
        return true;
    }
}
