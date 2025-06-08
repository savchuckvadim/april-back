import { Injectable } from "@nestjs/common";
import { BitrixService } from "src/modules/bitrix/";
import { PortalModel } from "src/modules/portal/services/portal.model";

@Injectable()
export class GsrMigrateBitrixAbstract {
    protected bitrix: BitrixService
    protected portal: PortalModel
    protected userId: string
    constructor(
    ) { }

    setContext(bitrix: BitrixService, portal: PortalModel, userId: string) {
        this.bitrix = bitrix;
        this.portal = portal;
        this.userId = userId;
    }

}
