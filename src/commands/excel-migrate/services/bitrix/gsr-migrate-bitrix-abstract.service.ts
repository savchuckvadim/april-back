import { Injectable } from "@nestjs/common";
import { BitrixService } from "src/modules/bitrix/";
import { PortalModel } from "src/modules/portal/services/portal.model";

@Injectable()
export class GsrMigrateBitrixAbstract {
    protected bitrix: BitrixService
    protected portal: PortalModel
    constructor(
    ) { }

    setContext(bitrix: BitrixService, portal: PortalModel) {
        this.bitrix = bitrix;
        this.portal = portal;
    }

}
