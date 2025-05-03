import { HttpService } from "@nestjs/axios";
import { IPortal } from "src/modules/portal/interfaces/portal.interface";
import { TelegramService } from "src/modules/telegram/telegram.service";
import { BitrixBaseApi } from "../base/bitrix-base-api";

export class BitrixApiQueueApiService extends BitrixBaseApi {
    constructor(
      portal: IPortal,
      http: HttpService,
      telegram: TelegramService
    ) {
      super(telegram, http);
      this.initFromPortal(portal);
    }
  }