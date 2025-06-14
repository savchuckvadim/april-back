import { Injectable } from '@nestjs/common';
import { BitrixDealService, Deal } from '../services/deal-flow/bitrix-deal.service';
import { BitrixDealBatchFlowService } from '../services/deal-flow/bitrix-deal-batch-flow.service';
import { BitrixBatchService } from '../services/general/bitrix-batch.service';
import { IBXDeal } from '@/modules/bitrix';
import { PBXService } from '@pbx';


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
export class EventDocumentService {


    constructor(
        private readonly pbx: PBXService,
        private readonly bitrixDealService: BitrixDealService,
        private readonly bitrixDealBatchFlowService: BitrixDealBatchFlowService,
        private readonly bitrixBatchService: BitrixBatchService
    ) { }

    async flow(dto: EventDocumentFlowDto): Promise<void> {
        const { bitrix, PortalModel } = await this.pbx.init(dto.domain)
        const portal = PortalModel.getPortal()
        // const dealService = new BitrixDealService(bitrix, portal)
        // const entityService = new BitrixEntityService(bitrix, portal)
        // const listService = new BitrixListService(bitrix, portal)

    }


}
