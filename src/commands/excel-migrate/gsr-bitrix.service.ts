import { EBXEntity, EBxMethod, EBxNamespace } from "src/modules/bitrix/core";

import { Injectable } from "@nestjs/common";
import { MigrateToBxDto } from "./dto/migrate-to-bx.dto";
import { BitrixApiQueueApiService } from "src/modules/bitrix/core/queue/bitrix-queue-api.service";
import { PortalService } from "src/modules/portal/portal.service";
import { BitrixApiFactoryService } from "src/modules/bitrix/core/queue/bitrix-api.factory.service";
import { PortalModel } from "src/modules/portal/services/portal.model";
import { GsrMigrateBitrixDealService } from "./services/bitrix/gsr-migrate-bxdeal.service";
import { GsrMigrateBitrixCompanyService } from "./services/bitrix/gsr-migrate-bxcompany.service";
import { GsrMigrateBitrixProductRowService } from "./services/bitrix/gsr-migrate-bxproduct-row.service";
import { GsrMigrateBitrixContactService } from "./services/bitrix/gsr-migrate-bxcontact.service";
@Injectable()
export class GsrBitrixService {
    private bitrixApi: BitrixApiQueueApiService
    private portal: PortalModel
    constructor(

        private readonly bitrixApiFactory: BitrixApiFactoryService,
        private readonly portalService: PortalService,
        private readonly companyService: GsrMigrateBitrixCompanyService,
        private readonly dealService: GsrMigrateBitrixDealService,
        private readonly productRowService: GsrMigrateBitrixProductRowService,
        private readonly contactService: GsrMigrateBitrixContactService
    ) { }

    async migrateToBitrix(domain: string, data: MigrateToBxDto[]) {
        this.portal = await this.portalService.getModelByDomain(domain);
        this.bitrixApi = this.bitrixApiFactory.create(this.portal.getPortal());

        const testField = this.portal.getCompanyFieldByCode('concurents_multiple')
        console.log(testField)




        // // передаём shared context
        this.companyService.setContext(this.bitrixApi, this.portal);
        this.dealService.setContext(this.bitrixApi, this.portal);
        this.productRowService.setContext(this.bitrixApi, this.portal);
        this.contactService.setContext(this.bitrixApi, this.portal);

        data.forEach((element, index) => {
            if (index >= 100 ) {
                const companyCmd = `${EBxNamespace.CRM}.${EBXEntity.COMPANY}.${EBxMethod.ADD}.${element.id}`
                this.companyService.getCompanyCommand(element, companyCmd)
                const dealCmd = `${EBxNamespace.CRM}.${EBXEntity.DEAL}.${EBxMethod.ADD}.${element.id}`
                const cntcCmds = this.contactService.getContactCommand(element, companyCmd)

                this.dealService.getDealCommand(element, companyCmd, dealCmd, cntcCmds)
                this.productRowService.getProductRowCommand(element, dealCmd)
                this.dealService.getDealUpdateCommand(cntcCmds, dealCmd)

            }
        });
        // const commands = { ...this.bitrixApi.getCmdBatch() }
        const result = await this.bitrixApi.callBatchWithConcurrency(3)


        return {
            // commands,
            // portal: this.portal,
            result,

        }
    }

}
