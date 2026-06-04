import { Injectable } from '@nestjs/common';
import { TelegramService } from '@lib/telegram/telegram.service';

import { BxAuthType } from '../base/bx-auth-type.enum';
import { BitrixBaseApi } from '../base/bitrix-base-api';
import { BitrixRateLimiterService } from '../rate-limit/bitrix-rate-limiter.service';
import { BitrixCredentials } from '../interface/bitrix-credentials.interface';

@Injectable()
export class BitrixApiFactoryService {
    constructor(
        private readonly telegram: TelegramService,
        private readonly rateLimiter: BitrixRateLimiterService,
    ) {}

    //NEW//
    public create(
        credentials: BitrixCredentials,
        authType: BxAuthType = BxAuthType.HOOK,
        token?: string,
    ): BitrixBaseApi {
        const api = new BitrixBaseApi(
            this.telegram,
            credentials.domain,
            credentials.key ?? '',
            token || null,
            authType,
            this.rateLimiter,
        );
        api.init();
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
