import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { IPortal } from 'src/modules/portal/interfaces/portal.interface';
import { TelegramService } from 'src/modules/telegram/telegram.service';

import { BxAuthType } from '../../bitrix-service.factory';
import { BitrixBaseApi } from '../base/bitrix-base-api';
import { BitrixAuthService } from '../../auth/bitrix-auth.service';


@Injectable()
export class BitrixApiFactoryService {
    constructor(
        private readonly telegram: TelegramService,

    ) {

    }

    //NEW//
    public async create(portal: IPortal, authType: BxAuthType = BxAuthType.HOOK, token?: string): Promise<BitrixBaseApi> {
        // const token = authType === BxAuthType.TOKEN ? await this.authService.getFreshToken(portal.domain) : null;
        const api = new BitrixBaseApi(
            this.telegram,
            portal.domain,
            portal.key,
            token || null,
            authType
        );
        api.init(portal)
        return api;
    }

    // //NEW//
    // public async create(portal: IPortal, authType: BxAuthType = BxAuthType.HOOK): Promise<BitrixBaseApi> {
    //     // const token = authType === BxAuthType.TOKEN ? await this.authService.getFreshToken(portal.domain) : null;
    //     const api = new BitrixBaseApi(
    //         this.telegram,
    //         portal.domain,
    //         portal.key,
    //         'token', authType
    //     );
    //     api.init(portal)
    //     return api;
    // }



    //OLD//

    // public async create(portal: IPortal, authType: BxAuthType = BxAuthType.HOOK): Promise<BitrixBaseApi> {

    //     const api = new BitrixBaseApi(
    //         this.telegram,
    //         this.httpService
    //     );
    //     api.init(portal)
    //     return api;
    // }

    // public async createAuthApi(portal: IPortal): Promise<BitrixAuthBaseApi> {
    //     const api = new BitrixAuthBaseApi(this.telegram, this.http, this.appService, this.authService);
    //     await api.init(portal);
    //     return api;
    // }
}

//   использование в воркере
// async handleJob(job: Job<{ domain: string }>) {
//   const portal = await this.portalService.getPortalByDomain(job.data.domain);
//   const api = this.apiFactory.create(portal);
