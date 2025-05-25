import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { IPortal } from "src/modules/portal/interfaces/portal.interface";
import { TelegramService } from "src/modules/telegram/telegram.service";
import { BitrixApiQueueApiService } from "./bitrix-queue-api.service";


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
  private bitrixApi: BitrixApiQueueApiService;
  constructor(
    private readonly telegram: TelegramService,
    private readonly http: HttpService
  ) { }

  create(portal: IPortal): BitrixApiQueueApiService {
    this.bitrixApi = new BitrixApiQueueApiService(portal, this.http, this.telegram);
    // return new BitrixApiQueueApiService(portal, this.http, this.telegram);
    return this.bitrixApi;
  }
  getBitrixApi(): BitrixApiQueueApiService {
    return this.bitrixApi;
  }
}


//   использование в воркере
// async handleJob(job: Job<{ domain: string }>) {
//   const portal = await this.portalService.getPortalByDomain(job.data.domain);
//   const api = this.apiFactory.create(portal);