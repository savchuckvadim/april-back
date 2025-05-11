import { EBXEntity, EBxMethod, EBxNamespace } from "src/modules/bitrix/core";

import { Injectable } from "@nestjs/common";
import { BitrixApiQueueApiService } from "src/modules/bitrix/core/queue/bitrix-queue-api.service";
import { PortalModel } from "src/modules/portal/services/portal.model";

@Injectable()
export class GsrMigrateBitrixAbstract {
    protected bitrixApi: BitrixApiQueueApiService
    protected portal: PortalModel
    constructor(
    ) { }

    setContext(bitrixApi: BitrixApiQueueApiService, portal: PortalModel) {
        this.bitrixApi = bitrixApi;
        this.portal = portal;
    }

}
