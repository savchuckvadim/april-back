import { Injectable, Logger } from "@nestjs/common";
import { CreateDealDto } from "../dto/create-deal.dto";
import { PortalContextService } from "src/modules/portal/services/portal-context.service";
import { BxDealService } from "src/modules/bitrix";
import { BitrixApiFactoryService } from "src/modules/bitrix/";
@Injectable()
export class CreateDealUseCase {
    constructor(
        private readonly portalService: PortalContextService,
        // private readonly bitrixService: BitrixRequestApiService,
        private readonly bitrixDealService: BxDealService,
        private readonly bitrixApiFactoryService: BitrixApiFactoryService
    ) { }

    async createDeal(data: CreateDealDto) {
        Logger.log(`Creating deal for domain: ${data.auth.domain}`);
        Logger.log(`Creating deal body: ${JSON.stringify(data)}`);
        const portal = this.portalService.getPortal();
        // this.bitrixService.initFromPortal(portal);
        this.bitrixApiFactoryService.create(portal);
        // const dealRepository = new BxDealRepository(this.bitrixService);
        const deal = await this.bitrixDealService.get(data.dealId);

        Logger.log(`ALFA CONTRACTS Deal: ${JSON.stringify(deal)}`);
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
