import { Injectable, Logger } from "@nestjs/common";
import { CreateDealDto } from "../dto/create-deal.dto";
import { PortalContextService } from "src/modules/portal/services/portal-context.service";
import { BitrixRequestApiService } from "src/modules/bitrix/core/http/bitrix-request-api.service";
import { BxDealRepository } from "src/modules/bitrix/domain/crm/deal/bx-deal.repository";

@Injectable()
export class CreateDealUseCase {
    constructor(
        private readonly portalService: PortalContextService,
        private readonly bitrixService: BitrixRequestApiService
    ) { }

    async createDeal(data: CreateDealDto) {
        Logger.log(`Creating deal for domain: ${data.auth.domain}`);
        Logger.log(`Creating deal body: ${JSON.stringify(data)}`);
        const portal = this.portalService.getPortal();
        this.bitrixService.initFromPortal(portal);
        const dealRepository = new BxDealRepository(this.bitrixService);
        const deal = await dealRepository.getDeal(data.dealId);

        Logger.log(`ALFA CONTRACTS Deal: ${JSON.stringify(deal)}`);
        return deal;
    }
}
