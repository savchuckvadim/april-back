import { Injectable, Logger } from "@nestjs/common";
import { CreateDealDto } from "../dto/create-deal.dto";
import { getBxFieldsIdsForSelect, getDealValues, updateDealDataFromBitrixResponse } from "../lib/deal-field.helper";
import { BxDealService } from "../services/bx-deal.service";
import { BxFieldsService } from "../services/bx-field.service";
@Injectable()
export class CreateDealUseCase {
    constructor(
        private readonly bxDealService: BxDealService,
        private readonly bxFieldsService: BxFieldsService

    ) { }
    async init(domain: string) {
        await this.bxDealService.init(domain);
        await this.bxFieldsService.init(domain);
    }
    async onDealCreate(data: CreateDealDto) {
        await this.init(data.auth.domain);


    


        const fields = await this.bxFieldsService.getDealFields();
        const fieldData = updateDealDataFromBitrixResponse(fields);
        const bxFieldsIds = getBxFieldsIdsForSelect(fieldData);


        const deal = await this.bxDealService.getDeal(data.dealId, bxFieldsIds);
        const dealValues = getDealValues(deal, fieldData);
        
        deal && deal.ID && await this.bxDealService.setTimeline(deal.ID, dealValues)

        return deal;
    }


    // constructor(
    //     private readonly portalService: PortalContextService,
    //     private readonly bitrixService: BitrixRequestApiService
    // ) { }

    // async createDeal(data: CreateDealDto) {
    //     Logger.log(`Creating deal for domain: ${data.auth.domain}`);
    //     Logger.log(`Creating deal body: ${JSON.stringify(data)}`);
    //     const portal = this.portalService.getPortal();
    //     this.bitrixService.initFromPortal(portal);
    //     const dealRepository = new BxDealRepository(this.bitrixService);
    //     const deal = await dealRepository.getDeal(data.dealId);

    //     Logger.log(`ALFA CONTRACTS Deal: ${JSON.stringify(deal)}`);
    //     return deal;
    // }
}
