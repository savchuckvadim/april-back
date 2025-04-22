import { IPortal } from "../interfaces/portal.interface";
import { Injectable } from "@nestjs/common";
import { PortalModel } from "../services/portal.model";
import { TelegramService } from "src/modules/telegram/telegram.service";

@Injectable()
export class PortalModelFactory {
  constructor(private readonly telegramService: TelegramService) {}

  create(portal: IPortal): PortalModel {
    return new PortalModel(portal, this.telegramService);
  }
}
