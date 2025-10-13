import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { IPortal } from 'src/modules/portal/interfaces/portal.interface';
import { TelegramService } from 'src/modules/telegram/telegram.service';
import { BitrixApiQueueApiService } from './bitrix-queue-api.service';
import { BitrixAuthBaseApi } from '../auth/bitrix-auth-base-api';
import { BitrixAuthService } from '../auth/bitrix-auth.service';
import { BitrixAppService } from '../../../bitrix-setup/app/services/bitrix-app.service';
import { BitrixBaseApi } from '../base/bitrix-base-api';

//ТОЛЬКО ДЛЯ ОЧЕРЕДЕЙ
// @Injectable()
// export class BitrixApiFactoryService {
//   constructor(
//     private readonly telegram: TelegramService,
//     // private readonly config: ConfigService,
//     private readonly http: HttpService,
//   ) { }

//   create(portal: IPortal) {
//     const api = new BitrixApiService(this.telegram, this.http);
//     api.initFromPortal(portal);
//     return api;
//   }
// }
@Injectable()
export class BitrixApiFactoryService {
    constructor(
        private readonly telegram: TelegramService,
        private readonly http: HttpService,
        private readonly appService: BitrixAppService,
        private readonly authService: BitrixAuthService,
    ) { }

    public create(portal: IPortal): BitrixBaseApi {
        const api = new BitrixBaseApi(this.telegram, this.http);
        api.init(portal)
        return api;
    }
    public async createAuthApi(portal: IPortal): Promise<BitrixAuthBaseApi> {
        const api = new BitrixAuthBaseApi(this.telegram, this.http, this.appService, this.authService);
        await api.init(portal);
        return api;
    }
}

//   использование в воркере
// async handleJob(job: Job<{ domain: string }>) {
//   const portal = await this.portalService.getPortalByDomain(job.data.domain);
//   const api = this.apiFactory.create(portal);
