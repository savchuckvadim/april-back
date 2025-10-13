import { PortalService } from '../portal/portal.service';
import { Injectable } from '@nestjs/common';
import { BitrixServiceFactory, BxAuthType } from '../bitrix/bitrix-service.factory';


@Injectable()
export class PBXService {
    constructor(
        private readonly bitrixFactory: BitrixServiceFactory,
        private readonly portal: PortalService,
    ) {}

    async init(domain: string, authType: BxAuthType = BxAuthType.HOOK) {
        const portal = await this.portal.getPortalByDomain(domain);
        const PortalModel = await this.portal.getModelByDomain(domain);


        const bitrix = await this.bitrixFactory.create(portal, authType); // ← полноценный BitrixService

        return {
            bitrix,
            portal,
            PortalModel,
        };
    }
}
