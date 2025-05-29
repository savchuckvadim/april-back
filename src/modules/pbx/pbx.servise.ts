import { BitrixService } from "../bitrix/bitrix.service";
import { PortalService } from "../portal/portal.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class PBXService {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalService,
    ) { }
    async init(domain: string) {
        const portal = await this.portal.getPortalByDomain(domain);
        const PortalModel = this.portal.getModelByDomain(domain);
        this.bitrix.init(portal);
        return {
            bitrix: this.bitrix,
            portal: this.portal,
            PortalModel
        }
    }
}

