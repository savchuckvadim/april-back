import { Injectable } from '@nestjs/common';
import { BitrixService } from './bitrix.service';
import { BitrixApiFactoryService } from './core/queue/bitrix-api.factory.service';

import { IPortal } from '../portal/interfaces/portal.interface';
import { ServiceClonerFactory } from './domain/service-clone.factory';
import { BitrixBaseApi } from './core/base/bitrix-base-api';
import { BitrixAuthBaseApi } from './core/auth/bitrix-auth-base-api';
export enum BxAuthType {
    TOKEN = 'token',
    HOOK = 'hook',
}

@Injectable()
export class BitrixServiceFactory {
    constructor(
        private readonly bitrixApiFactoryService: BitrixApiFactoryService,
        private readonly cloner: ServiceClonerFactory,
    ) { }

    public async create(portal: IPortal, authType: BxAuthType = BxAuthType.HOOK): Promise<BitrixService> {

        const bitrixApi = authType === BxAuthType.HOOK
            ? this.bitrixApiFactoryService.create(portal)
            : await this.bitrixApiFactoryService.createAuthApi(portal);
        // : await this.bitrixApiFactoryService.createAuthApi(portal);



        const instance = new BitrixService(
            bitrixApi,
            this.cloner,
        );

        instance.init(portal);
        return instance;
    }
}
