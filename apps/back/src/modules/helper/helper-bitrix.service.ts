import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BxAuthType } from '@/modules/bitrix/bitrix-service.factory';

@Injectable()
export class HelperBitrixService {
    constructor(private readonly pbxService: PBXService) {}

    async bxMethod(
        domain: string,
        method: string,
        params: any,
        authType: BxAuthType = BxAuthType.HOOK,
    ) {
        const { bitrix } = await this.pbxService.init(domain, authType);
        const result = await bitrix.api.call(method, params);
        return result;
    }
}
