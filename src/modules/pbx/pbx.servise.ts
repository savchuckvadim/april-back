import { BitrixService } from "../bitrix/bitrix.service";
import { PortalService } from "../portal/portal.service";
import { Injectable } from "@nestjs/common";
import { BitrixServiceFactory } from "../bitrix/bitrix-service.factory";

@Injectable()
export class PBXService {

    constructor(
        private readonly bitrixFactory: BitrixServiceFactory,
        private readonly portal: PortalService,
    ) { }

    async init(domain: string) {
        const portal = await this.portal.getPortalByDomain(domain);
        const PortalModel = await this.portal.getModelByDomain(domain);
        const bitrix = this.bitrixFactory.create(portal); // ← полноценный BitrixService

        return {
            bitrix,
            portal,
            PortalModel
        }
    }

}

