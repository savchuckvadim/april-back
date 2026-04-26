import { PBXService } from '@/modules/pbx';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SmartActGsrService {
    constructor(private readonly pbx: PBXService) {}

    async getSmartActGsr() {
        const domain = 'gsr.bitrix24.ru';
        const { PortalModel, portal } = await this.pbx.init(domain);
        const targetSmart = PortalModel.getSmartByType('service_act');
        const smarts = portal.smarts;
        return {
            targetSmart,
            smarts: smarts?.map(s => s.name),
        };
    }
}
