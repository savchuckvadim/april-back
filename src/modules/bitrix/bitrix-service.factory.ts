// ..C:\Projects\April\april-next\back\src\modules\bitrix\bitrix-service.factory.ts,
import { Injectable } from '@nestjs/common';
import { BitrixService } from './bitrix.service';
import { BitrixApiFactoryService } from './core/queue/bitrix-api.factory.service';

import { IPortal } from '../portal/interfaces/portal.interface';
import { ServiceClonerFactory } from './domain/service-clone.factory';
import { BitrixAuthService } from './auth/bitrix-auth.service';



export enum BxAuthType {
    TOKEN = 'token',
    HOOK = 'hook',
}

@Injectable()
export class BitrixServiceFactory {
    constructor(
        private readonly bitrixApiFactoryService: BitrixApiFactoryService,
        private readonly cloner: ServiceClonerFactory,
        private readonly authService: BitrixAuthService,
        // private readonly telegram: TelegramService,
        // private readonly httpService: HttpService,
    ) { }

    public async create(portal: IPortal, authType: BxAuthType = BxAuthType.HOOK): Promise<BitrixService> {

        // const bitrixApiFactoryService = new BitrixApiFactoryService(this.telegram, this.httpService);

        const token = authType === BxAuthType.TOKEN
            ? await this.authService.getFreshToken(portal.domain)
            : undefined;
        const bitrixApi = await this.bitrixApiFactoryService.create(portal, authType, token);


        const instance = new BitrixService(
            bitrixApi,
            this.cloner,
        );

        instance.init(portal);
        return instance;
    }
}
